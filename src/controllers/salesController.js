const prisma = require('../lib/prisma');
const { auditLog } = require('../middleware/audit');
const generateInvoice = () => {
  const d = new Date();
  const prefix = `INV${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `${prefix}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
};

exports.getAll = async (req, res) => {
  try {
    const { seller_id, start_date, end_date, page = 1, limit = 20 } = req.query;
    const branchId = req.user.effective_branch_id;
    const where = {};

    if (branchId !== null) where.branch_id = branchId;

    if (req.user.role !== 'admin') {
      where.seller_id = req.user.id;
    } else if (seller_id) {
      where.seller_id = parseInt(seller_id);
    }
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date)   where.created_at.lte = new Date(end_date + 'T23:59:59');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { seller: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({
      sales: sales.map(s => ({ ...s, seller_name: s.seller.name, seller: undefined })),
      total,
      page: parseInt(page),
      limit: take,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        seller:     { select: { name: true } },
        sale_items: true,
      },
    });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const branchId = req.user.effective_branch_id;
    if (branchId !== null && sale.branch_id !== branchId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role !== 'admin' && sale.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      sale: {
        ...sale,
        seller_name: sale.seller.name,
        seller:      undefined,
        items:       sale.sale_items,
        sale_items:  undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.create = async (req, res) => {
  const { items, customer_name, customer_phone, payment_method = 'CASH', discount = 0, notes } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const branchId = req.user.effective_branch_id;
  if (branchId === null) {
    return res.status(400).json({ error: 'Select a branch before recording a sale' });
  }

  try {
    const { saleId, invoiceNumber, totalAmount } = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const processedItems = [];

      for (const item of items) {
        const product = await tx.product.findFirst({
          where: { id: parseInt(item.product_id), is_active: true, branch_id: branchId },
        });
        if (!product) throw new Error(`Product ${item.product_id} not found`);
        if (product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for: ${product.name}`);
        }

        const sellingPrice   = parseFloat(item.selling_price) || 0;
        const wholesalePrice = parseFloat(product.wholesale_price) || 0;

        if (wholesalePrice > 0 && sellingPrice < wholesalePrice) {
          throw Object.assign(
            new Error(`Selling price for "${product.name}" (${sellingPrice}) is below wholesale price (${wholesalePrice}). Sale denied.`),
            { status: 422 }
          );
        }

        const lineTotal = (sellingPrice - (item.discount || 0)) * item.quantity;
        subtotal += lineTotal;
        processedItems.push({ ...item, product, lineTotal, sellingPrice, wholesalePrice });
      }

      const totalAmount   = subtotal - parseFloat(discount);
      const invoiceNumber = generateInvoice();

      const sale = await tx.sale.create({
        data: {
          invoice_number: invoiceNumber,
          seller_id:      req.user.id,
          branch_id:      branchId,
          customer_name:  customer_name  || null,
          customer_phone: customer_phone || null,
          subtotal,
          discount:       parseFloat(discount),
          total_amount:   totalAmount,
          payment_method,
          notes:          notes || null,
        },
      });

      for (const item of processedItems) {
        await tx.saleItem.create({
          data: {
            sale_id:       sale.id,
            product_id:    parseInt(item.product_id),
            product_name:  item.product.name,
            quantity:      item.quantity,
            selling_price: item.sellingPrice,
            cost_price:    item.wholesalePrice,
            discount:      item.discount || 0,
            line_total:    item.lineTotal,
          },
        });

        const newQty = item.product.quantity - item.quantity;
        await tx.product.update({
          where: { id: parseInt(item.product_id) },
          data:  { quantity: newQty },
        });
        await tx.stockMovement.create({
          data: {
            product_id:      parseInt(item.product_id),
            movement_type:   'OUT',
            quantity:        item.quantity,
            quantity_before: item.product.quantity,
            quantity_after:  newQty,
            reference_type:  'SALE',
            reference_id:    sale.id,
            performed_by:    req.user.id,
          },
        });
      }

      return { saleId: sale.id, invoiceNumber, totalAmount };
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name, branchId,
      action: 'CREATE_SALE', module: 'SALES', entityType: 'sale', entityId: saleId,
      description: `Sale created: ${invoiceNumber} - Total: ${totalAmount}`,
      newValues: { invoice_number: invoiceNumber, total_amount: totalAmount, items_count: items.length },
    });

    const io = req.app.get('io');
    if (io) {
      io.to('dashboard').emit('new_sale', {
        id:             saleId,
        invoice_number: invoiceNumber,
        total_amount:   totalAmount,
        seller_name:    req.user.name,
        branch_id:      branchId,
        items_count:    items.length,
        created_at:     new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Kigali' }).replace(' ', 'T'),
      });
    }

    res.status(201).json({
      message:        'Sale recorded successfully',
      sale_id:        saleId,
      invoice_number: invoiceNumber,
      total_amount:   totalAmount,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 400).json({ error: err.message || 'Failed to create sale' });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where:   { id },
      include: { sale_items: true },
    });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const branchId = req.user.effective_branch_id;
    if (branchId !== null && sale.branch_id !== branchId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of sale.sale_items) {
        const product = await tx.product.findUnique({ where: { id: item.product_id } });
        if (product) {
          const restoredQty = product.quantity + item.quantity;
          await tx.product.update({
            where: { id: item.product_id },
            data:  { quantity: restoredQty },
          });
          await tx.stockMovement.create({
            data: {
              product_id:      item.product_id,
              movement_type:   'RETURN',
              quantity:        item.quantity,
              quantity_before: product.quantity,
              quantity_after:  restoredQty,
              reference_type:  'SALE_DELETE',
              reference_id:    id,
              performed_by:    req.user.id,
            },
          });
        }
      }
      await tx.sale.delete({ where: { id } });
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name, branchId: sale.branch_id,
      action: 'DELETE_SALE', module: 'SALES', entityType: 'sale', entityId: id,
      description: `Sale deleted: ${sale.invoice_number} — Total: ${sale.total_amount}`,
      oldValues: { invoice_number: sale.invoice_number, total_amount: sale.total_amount },
    });

    const io = req.app.get('io');
    if (io) io.to('dashboard').emit('sale_deleted', { id });

    res.json({ message: `Sale ${sale.invoice_number} deleted and stock restored` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getDailySummary = async (req, res) => {
  try {
    const date     = req.query.date || new Date().toISOString().split('T')[0];
    const branchId = req.user.effective_branch_id;
    const sellerId = req.user.role !== 'admin' ? req.user.id : req.query.seller_id ? parseInt(req.query.seller_id) : null;

    const sellerClause = sellerId  ? `AND s.seller_id = ${sellerId}` : '';
    const branchClause = branchId !== null ? `AND s.branch_id = ${branchId}` : '';

    const [summary, topProducts] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as transactions, COALESCE(SUM(s.total_amount),0) as revenue,
               COALESCE(SUM(si.quantity),0) as items_sold
        FROM sales s JOIN sale_items si ON s.id = si.sale_id
        WHERE DATE(s.created_at) = ? ${sellerClause} ${branchClause}`, date),
      prisma.$queryRawUnsafe(`
        SELECT si.product_name, SUM(si.quantity) as qty_sold, SUM(si.line_total) as revenue
        FROM sales s JOIN sale_items si ON s.id = si.sale_id
        WHERE DATE(s.created_at) = ? ${sellerClause} ${branchClause}
        GROUP BY si.product_id, si.product_name ORDER BY qty_sold DESC LIMIT 5`, date),
    ]);

    res.json({ date, summary: summary[0], top_products: topProducts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
