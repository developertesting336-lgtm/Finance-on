import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';

export const handleWebhook = async (req: Request, res: Response) => {
  const summary: {
    receivedType?: string;
    format?: string;
    totalReceived: number;
    savedCount: number;
    failedCount: number;
    errors: Array<{ itemIndex?: number; id?: string | number; error: string }>;
  } = {
    totalReceived: 0,
    savedCount: 0,
    failedCount: 0,
    errors: [],
  };

  try {
    const payload = req.body;
    summary.receivedType = payload?.type || 'json_batch';
    summary.format = payload?.format || 'json';

    console.log('\n================================ Webhook Incoming ================================');
    console.log(`📦 Webhook Payload Received at ${new Date().toISOString()}`);
    console.log(`📋 Type: ${summary.receivedType} | Format: ${summary.format}`);
    //   console.log('🔍 Raw Payload Keys:', payload ? Object.keys(payload) : []);

    //   // Helper to create clean ISO string (no Temporal dependency)
    //   const getNow = () => new Date().toISOString();

    //   // Helper to parse simple CSV string if needed
    //   const parseCsv = (csvData: string) => {
    //     const lines = csvData.trim().split('\n').slice(1); // skip header
    //     return lines.map(line => {
    //       const vals = [];
    //       let cur = '';
    //       let inQuotes = false;
    //       for (let i = 0; i < line.length; i++) {
    //         if (line[i] === '"') {
    //           inQuotes = !inQuotes;
    //         } else if (line[i] === ',' && !inQuotes) {
    //           vals.push(cur);
    //           cur = '';
    //         } else {
    //           cur += line[i];
    //         }
    //       }
    //       vals.push(cur);
    //       return vals;
    //     });
    //   };

    //   // ──────────────────────────────────────────────────────────────────────────
    //   // 1. CSV FORMAT PROCESSING
    //   // ──────────────────────────────────────────────────────────────────────────
    //   if (payload.format === 'csv' && typeof payload.data === 'string') {
    //     const rows = parseCsv(payload.data);
    //     summary.totalReceived = rows.length;
    //     console.log(`📊 Processing CSV with ${rows.length} rows for model: ${payload.type}`);

    //     if (payload.type === 'clientes' || payload.type === 'customers') {
    //       for (let i = 0; i < rows.length; i++) {
    //         const row = rows[i];
    //         if (!row[0]) {
    //           console.warn(`⚠️ [Clientes CSV Row ${i + 1}] Skipped: Missing ID in column 0`);
    //           continue;
    //         }
    //         const rawId = String(row[0]).replace(/\D/g, '');
    //         const clientId = rawId ? parseInt(rawId, 10) : NaN;
    //         if (isNaN(clientId)) {
    //           summary.failedCount++;
    //           const errStr = `Invalid numeric ID: "${row[0]}"`;
    //           console.error(`❌ [Clientes CSV Row ${i + 1}] Error: ${errStr}`);
    //           summary.errors.push({ itemIndex: i + 1, id: row[0], error: errStr });
    //           continue;
    //         }

    //         try {
    //           await db.orm.public.Clientes.upsert({
    //             create: {
    //               cliente: clientId,
    //               nombre: row[1] || null,
    //               razonComercial: row[2] || null,
    //               direccion: row[3] || null,
    //               cPostal: row[4] || null,
    //               poblacion: row[5] || null,
    //               provincia: row[6] || null,
    //               cif: row[7] || null,
    //               telefono: row[8] || null,
    //               email: row[9] || null,
    //               fechaAlta: row[10] || null,
    //               fechaBaja: row[11] || null,
    //               formaPago: row[12] || null,
    //               createdAt: getNow(),
    //               updatedAt: getNow(),
    //             },
    //             update: {
    //               nombre: row[1] || null,
    //               razonComercial: row[2] || null,
    //               direccion: row[3] || null,
    //               cPostal: row[4] || null,
    //               poblacion: row[5] || null,
    //               provincia: row[6] || null,
    //               cif: row[7] || null,
    //               telefono: row[8] || null,
    //               email: row[9] || null,
    //               fechaAlta: row[10] || null,
    //               fechaBaja: row[11] || null,
    //               formaPago: row[12] || null,
    //               updatedAt: getNow(),
    //             }
    //           });
    //           summary.savedCount++;
    //           console.log(`✅ [Clientes CSV] Saved clientId: ${clientId} (${row[1] || 'No Name'})`);
    //         } catch (err: any) {
    //           summary.failedCount++;
    //           console.error(`❌ [Clientes CSV] Failed saving clientId: ${clientId} - Error:`, err.message);
    //           summary.errors.push({ itemIndex: i + 1, id: clientId, error: err.message });
    //         }
    //       }
    //     } else if (payload.type === 'articulos' || payload.type === 'products') {
    //       for (let i = 0; i < rows.length; i++) {
    //         const row = rows[i];
    //         const articuloCode = row[0]?.trim();
    //         if (!articuloCode) {
    //           console.warn(`⚠️ [Articulos CSV Row ${i + 1}] Skipped: Missing article code`);
    //           continue;
    //         }

    //         try {
    //           await db.orm.public.Articulos.upsert({
    //             create: {
    //               articulo: articuloCode,
    //               nombreArticulo: row[1] || null,
    //               col01: row[2] || null,
    //               col02: row[3] || null,
    //               col03: row[4] || null,
    //               tipoRegistro: row[5] || null,
    //               createdAt: getNow(),
    //               updatedAt: getNow(),
    //             },
    //             update: {
    //               nombreArticulo: row[1] || null,
    //               col01: row[2] || null,
    //               col02: row[3] || null,
    //               col03: row[4] || null,
    //               tipoRegistro: row[5] || null,
    //               updatedAt: getNow(),
    //             }
    //           });
    //           summary.savedCount++;
    //           console.log(`✅ [Articulos CSV] Saved articulo: ${articuloCode} (${row[1] || ''})`);
    //         } catch (err: any) {
    //           summary.failedCount++;
    //           console.error(`❌ [Articulos CSV] Failed saving articulo: ${articuloCode} - Error:`, err.message);
    //           summary.errors.push({ itemIndex: i + 1, id: articuloCode, error: err.message });
    //         }
    //       }
    //     } else if (payload.type === 'proveedores' || payload.type === 'suppliers') {
    //       for (let i = 0; i < rows.length; i++) {
    //         const row = rows[i];
    //         if (!row[0]) {
    //           console.warn(`⚠️ [Proveedores CSV Row ${i + 1}] Skipped: Missing ID`);
    //           continue;
    //         }
    //         const rawId = String(row[0]).replace(/\D/g, '');
    //         const pId = rawId ? parseInt(rawId, 10) : NaN;
    //         if (isNaN(pId)) {
    //           summary.failedCount++;
    //           const errStr = `Invalid numeric ID: "${row[0]}"`;
    //           console.error(`❌ [Proveedores CSV Row ${i + 1}] Error: ${errStr}`);
    //           summary.errors.push({ itemIndex: i + 1, id: row[0], error: errStr });
    //           continue;
    //         }

    //         try {
    //           await db.orm.public.Proveedores.upsert({
    //             create: {
    //               proveedor: pId,
    //               nombre: row[1] || null,
    //               razonComercial: row[2] || null,
    //               direccion: row[3] || null,
    //               cPostal: row[4] || null,
    //               poblacion: row[5] || null,
    //               provincia: row[6] || null,
    //               cif: row[7] || null,
    //               telefono: row[8] || null,
    //               email: row[9] || null,
    //               formaPago: row[10] || null,
    //               createdAt: getNow(),
    //               updatedAt: getNow(),
    //             },
    //             update: {
    //               nombre: row[1] || null,
    //               razonComercial: row[2] || null,
    //               direccion: row[3] || null,
    //               cPostal: row[4] || null,
    //               poblacion: row[5] || null,
    //               provincia: row[6] || null,
    //               cif: row[7] || null,
    //               telefono: row[8] || null,
    //               email: row[9] || null,
    //               formaPago: row[10] || null,
    //               updatedAt: getNow(),
    //             }
    //           });
    //           summary.savedCount++;
    //           console.log(`✅ [Proveedores CSV] Saved proveedorId: ${pId} (${row[1] || ''})`);
    //         } catch (err: any) {
    //           summary.failedCount++;
    //           console.error(`❌ [Proveedores CSV] Failed saving proveedorId: ${pId} - Error:`, err.message);
    //           summary.errors.push({ itemIndex: i + 1, id: pId, error: err.message });
    //         }
    //       }
    //     } else if (payload.type === 'facturas' || payload.type === 'invoices') {
    //       for (let i = 0; i < rows.length; i++) {
    //         const row = rows[i];
    //         const facturaCode = row[0]?.trim();
    //         if (!facturaCode) {
    //           console.warn(`⚠️ [Facturas CSV Row ${i + 1}] Skipped: Missing invoice code`);
    //           continue;
    //         }

    //         try {
    //           await db.orm.public.Facturas.upsert({
    //             create: {
    //               factura: facturaCode,
    //               nFraExp: row[1] || null,
    //               fecha: row[2] || null,
    //               cliente: row[3] || null,
    //               nombre: row[4] || null,
    //               baseImponible: row[5] || null,
    //               porcentajeIva: row[6] || null,
    //               iva: row[7] || null,
    //               porcentajeRecargo: row[8] || null,
    //               recargo: row[9] || null,
    //               porcentajeRetencion: row[10] || null,
    //               retencion: row[11] || null,
    //               total: row[12] || null,
    //               tipoRegistro: row[13] || null,
    //               createdAt: getNow(),
    //               updatedAt: getNow(),
    //             },
    //             update: {
    //               nFraExp: row[1] || null,
    //               fecha: row[2] || null,
    //               cliente: row[3] || null,
    //               nombre: row[4] || null,
    //               baseImponible: row[5] || null,
    //               porcentajeIva: row[6] || null,
    //               iva: row[7] || null,
    //               porcentajeRecargo: row[8] || null,
    //               recargo: row[9] || null,
    //               porcentajeRetencion: row[10] || null,
    //               retencion: row[11] || null,
    //               total: row[12] || null,
    //               tipoRegistro: row[13] || null,
    //               updatedAt: getNow(),
    //             }
    //           });
    //           summary.savedCount++;
    //           console.log(`✅ [Facturas CSV] Saved factura: ${facturaCode} (${row[4] || ''})`);
    //         } catch (err: any) {
    //           summary.failedCount++;
    //           console.error(`❌ [Facturas CSV] Failed saving factura: ${facturaCode} - Error:`, err.message);
    //           summary.errors.push({ itemIndex: i + 1, id: facturaCode, error: err.message });
    //         }
    //       }
    //     }

    //     console.log(`\n🏁 [CSV Execution Summary] Total: ${summary.totalReceived} | Saved: ${summary.savedCount} | Failed: ${summary.failedCount}`);
    //     return res.status(200).json({
    //       status: 'success',
    //       message: `Processed CSV for ${payload.type}`,
    //       summary,
    //     });
    //   }

    //   // ──────────────────────────────────────────────────────────────────────────
    //   // 2. JSON FORMAT PROCESSING (Top-level & Nested data wrapper e.g. Sage 50)
    //   // ──────────────────────────────────────────────────────────────────────────
    //   const dataSource = (payload.data && typeof payload.data === 'object') ? payload.data : payload;

    //   // Helper: Normalize customer list from payload.clientes or payload.customers or payload.data.customers
    //   const rawCustomers = dataSource.clientes || dataSource.customers || payload.clientes || payload.customers;
    //   if (rawCustomers && (Array.isArray(rawCustomers) || typeof rawCustomers === 'object')) {
    //     const customersList = Array.isArray(rawCustomers) ? rawCustomers : [rawCustomers];
    //     summary.totalReceived += customersList.length;

    //     for (let i = 0; i < customersList.length; i++) {
    //       const item = customersList[i];
    //       // Support { cliente }, { CustomerCode }, { ACCOUNT_REF }, { customer_code }, { id }
    //       const rawCode = item.cliente ?? item.CustomerCode ?? item.customerCode ?? item.ACCOUNT_REF ?? item.account_ref ?? item.id;

    //       // Strip non-digits or parse numeric ID for Postgres Clientes.cliente Int
    //       const rawCodeStr = String(rawCode ?? '').trim();
    //       const digitsOnly = rawCodeStr.replace(/\D/g, '');
    //       const clienteNum = digitsOnly ? parseInt(digitsOnly, 10) : (rawCode ? Number(rawCode) : NaN);

    //       if (isNaN(clienteNum)) {
    //         summary.failedCount++;
    //         const errStr = `Invalid or missing numeric customer ID from "${rawCodeStr}"`;
    //         console.error(`❌ [Clientes JSON Item ${i + 1}] Error: ${errStr} | Raw item:`, item);
    //         summary.errors.push({ itemIndex: i + 1, id: rawCodeStr || undefined, error: errStr });
    //         continue;
    //       }

    //       const nombre = item.nombre ?? item.CustomerName ?? item.customerName ?? item.NAME ?? item.name ?? null;
    //       const telefono = item.telefono ?? item.Phone ?? item.phone ?? item.TELEPHONE ?? item.telephone ?? null;
    //       const razonComercial = item.razonComercial ?? item.commercialName ?? null;
    //       const direccion = item.direccion ?? item.address ?? null;
    //       const cPostal = item.cPostal ?? item.postalCode ?? item.postcode ?? null;
    //       const poblacion = item.poblacion ?? item.city ?? item.town ?? null;
    //       const provincia = item.provincia ?? item.province ?? null;
    //       const cif = item.cif ?? item.taxId ?? item.vatNumber ?? null;
    //       const email = item.email ?? null;
    //       const formaPago = item.formaPago ?? item.paymentTerms ?? null;

    //       try {
    //         await db.orm.public.Clientes.upsert({
    //           create: {
    //             cliente: clienteNum,
    //             nombre,
    //             telefono,
    //             razonComercial,
    //             direccion,
    //             cPostal,
    //             poblacion,
    //             provincia,
    //             cif,
    //             email,
    //             formaPago,
    //             createdAt: getNow(),
    //             updatedAt: getNow(),
    //           },
    //           update: {
    //             nombre: nombre || undefined,
    //             telefono: telefono || undefined,
    //             razonComercial: razonComercial || undefined,
    //             direccion: direccion || undefined,
    //             cPostal: cPostal || undefined,
    //             poblacion: poblacion || undefined,
    //             provincia: provincia || undefined,
    //             cif: cif || undefined,
    //             email: email || undefined,
    //             formaPago: formaPago || undefined,
    //             updatedAt: getNow(),
    //           },
    //         });
    //         summary.savedCount++;
    //         console.log(`✅ [Clientes JSON] Saved cliente: ${clienteNum} (${nombre || ''})`);
    //       } catch (err: any) {
    //         summary.failedCount++;
    //         console.error(`❌ [Clientes JSON] Failed saving cliente: ${clienteNum} - Error:`, err.message);
    //         summary.errors.push({ itemIndex: i + 1, id: clienteNum, error: err.message });
    //       }
    //     }
    //   }

    //   // Helper: Normalize products / articles
    //   const rawArticles = dataSource.articulos || dataSource.products || payload.articulos || payload.products;
    //   if (rawArticles && (Array.isArray(rawArticles) || typeof rawArticles === 'object')) {
    //     const articlesList = Array.isArray(rawArticles) ? rawArticles : [rawArticles];
    //     summary.totalReceived += articlesList.length;

    //     for (let i = 0; i < articlesList.length; i++) {
    //       const item = articlesList[i];
    //       const articuloStr = String(item.articulo ?? item.ProductCode ?? item.productCode ?? item.STOCK_CODE ?? item.id ?? '').trim();
    //       if (!articuloStr) {
    //         summary.failedCount++;
    //         const errStr = 'Missing article identifier';
    //         console.error(`❌ [Articulos JSON Item ${i + 1}] Error: ${errStr}`);
    //         summary.errors.push({ itemIndex: i + 1, error: errStr });
    //         continue;
    //       }

    //       const nombreArticulo = item.nombreArticulo ?? item.description ?? item.Description ?? item.NAME ?? null;
    //       const col01 = item.col01 ?? null;
    //       const col02 = item.col02 ?? null;
    //       const col03 = item.col03 ?? null;
    //       const tipoRegistro = item.tipoRegistro ?? null;

    //       try {
    //         await db.orm.public.Articulos.upsert({
    //           create: {
    //             articulo: articuloStr,
    //             nombreArticulo,
    //             col01,
    //             col02,
    //             col03,
    //             tipoRegistro,
    //             createdAt: getNow(),
    //             updatedAt: getNow(),
    //           },
    //           update: {
    //             nombreArticulo: nombreArticulo || undefined,
    //             col01: col01 || undefined,
    //             col02: col02 || undefined,
    //             col03: col03 || undefined,
    //             tipoRegistro: tipoRegistro || undefined,
    //             updatedAt: getNow(),
    //           },
    //         });
    //         summary.savedCount++;
    //         console.log(`✅ [Articulos JSON] Saved articulo: ${articuloStr}`);
    //       } catch (err: any) {
    //         summary.failedCount++;
    //         console.error(`❌ [Articulos JSON] Failed saving articulo: ${articuloStr} - Error:`, err.message);
    //         summary.errors.push({ itemIndex: i + 1, id: articuloStr, error: err.message });
    //       }
    //     }
    //   }

    //   // Helper: Normalize suppliers / proveedores
    //   const rawSuppliers = dataSource.proveedores || dataSource.suppliers || payload.proveedores || payload.suppliers;
    //   if (rawSuppliers && (Array.isArray(rawSuppliers) || typeof rawSuppliers === 'object')) {
    //     const suppliersList = Array.isArray(rawSuppliers) ? rawSuppliers : [rawSuppliers];
    //     summary.totalReceived += suppliersList.length;

    //     for (let i = 0; i < suppliersList.length; i++) {
    //       const item = suppliersList[i];
    //       const rawCode = item.proveedor ?? item.SupplierCode ?? item.supplierCode ?? item.ACCOUNT_REF ?? item.id;
    //       const rawCodeStr = String(rawCode ?? '').trim();
    //       const digitsOnly = rawCodeStr.replace(/\D/g, '');
    //       const proveedorNum = digitsOnly ? parseInt(digitsOnly, 10) : (rawCode ? Number(rawCode) : NaN);

    //       if (isNaN(proveedorNum)) {
    //         summary.failedCount++;
    //         const errStr = `Invalid numeric ID: "${rawCodeStr}"`;
    //         console.error(`❌ [Proveedores JSON Item ${i + 1}] Error: ${errStr}`);
    //         summary.errors.push({ itemIndex: i + 1, id: rawCodeStr, error: errStr });
    //         continue;
    //       }

    //       const nombre = item.nombre ?? item.SupplierName ?? item.supplierName ?? item.NAME ?? item.name ?? null;
    //       const telefono = item.telefono ?? item.Phone ?? item.phone ?? item.TELEPHONE ?? null;
    //       const razonComercial = item.razonComercial ?? null;
    //       const direccion = item.direccion ?? item.address ?? null;
    //       const cPostal = item.cPostal ?? item.postalCode ?? null;
    //       const poblacion = item.poblacion ?? item.city ?? null;
    //       const provincia = item.provincia ?? item.province ?? null;
    //       const cif = item.cif ?? item.taxId ?? null;
    //       const email = item.email ?? null;
    //       const formaPago = item.formaPago ?? null;

    //       try {
    //         await db.orm.public.Proveedores.upsert({
    //           create: {
    //             proveedor: proveedorNum,
    //             nombre,
    //             telefono,
    //             razonComercial,
    //             direccion,
    //             cPostal,
    //             poblacion,
    //             provincia,
    //             cif,
    //             email,
    //             formaPago,
    //             createdAt: getNow(),
    //             updatedAt: getNow(),
    //           },
    //           update: {
    //             nombre: nombre || undefined,
    //             telefono: telefono || undefined,
    //             razonComercial: razonComercial || undefined,
    //             direccion: direccion || undefined,
    //             cPostal: cPostal || undefined,
    //             poblacion: poblacion || undefined,
    //             provincia: provincia || undefined,
    //             cif: cif || undefined,
    //             email: email || undefined,
    //             formaPago: formaPago || undefined,
    //             updatedAt: getNow(),
    //           },
    //         });
    //         summary.savedCount++;
    //         console.log(`✅ [Proveedores JSON] Saved proveedor: ${proveedorNum}`);
    //       } catch (err: any) {
    //         summary.failedCount++;
    //         console.error(`❌ [Proveedores JSON] Failed saving proveedor: ${proveedorNum} - Error:`, err.message);
    //         summary.errors.push({ itemIndex: i + 1, id: proveedorNum, error: err.message });
    //       }
    //     }
    //   }

    //   // Helper: Normalize invoices / facturas
    //   const rawInvoices = dataSource.facturas || dataSource.invoices || payload.facturas || payload.invoices;
    //   if (rawInvoices && (Array.isArray(rawInvoices) || typeof rawInvoices === 'object')) {
    //     const invoicesList = Array.isArray(rawInvoices) ? rawInvoices : [rawInvoices];
    //     summary.totalReceived += invoicesList.length;

    //     for (let i = 0; i < invoicesList.length; i++) {
    //       const item = invoicesList[i];
    //       const facturaStr = String(item.factura ?? item.InvoiceNumber ?? item.invoiceNumber ?? item.INVOICE_NUMBER ?? item.id ?? '').trim();
    //       if (!facturaStr) {
    //         summary.failedCount++;
    //         const errStr = 'Missing invoice identifier';
    //         console.error(`❌ [Facturas JSON Item ${i + 1}] Error: ${errStr}`);
    //         summary.errors.push({ itemIndex: i + 1, error: errStr });
    //         continue;
    //       }

    //       const nFraExp = item.nFraExp ?? null;
    //       const fecha = item.fecha ?? item.Date ?? item.date ?? null;
    //       const cliente = item.cliente ?? item.CustomerCode ?? item.customerCode ?? null;
    //       const nombre = item.nombre ?? item.CustomerName ?? item.customerName ?? item.NAME ?? null;
    //       const baseImponible = item.baseImponible ? String(item.baseImponible) : (item.NetAmount ? String(item.NetAmount) : null);
    //       const porcentajeIva = item.porcentajeIva ? String(item.porcentajeIva) : (item.TaxRate ? String(item.TaxRate) : null);
    //       const iva = item.iva ? String(item.iva) : (item.TaxAmount ? String(item.TaxAmount) : null);
    //       const porcentajeRecargo = item.porcentajeRecargo ? String(item.porcentajeRecargo) : null;
    //       const recargo = item.recargo ? String(item.recargo) : null;
    //       const porcentajeRetencion = item.porcentajeRetencion ? String(item.porcentajeRetencion) : null;
    //       const retencion = item.retencion ? String(item.retencion) : null;
    //       const total = item.total ? String(item.total) : (item.GrossAmount ? String(item.GrossAmount) : null);
    //       const tipoRegistro = item.tipoRegistro ?? null;

    //       try {
    //         await db.orm.public.Facturas.upsert({
    //           create: {
    //             factura: facturaStr,
    //             nFraExp,
    //             fecha,
    //             cliente,
    //             nombre,
    //             baseImponible,
    //             porcentajeIva,
    //             iva,
    //             porcentajeRecargo,
    //             recargo,
    //             porcentajeRetencion,
    //             retencion,
    //             total,
    //             tipoRegistro,
    //             createdAt: getNow(),
    //             updatedAt: getNow(),
    //           },
    //           update: {
    //             nFraExp: nFraExp || undefined,
    //             fecha: fecha || undefined,
    //             cliente: cliente || undefined,
    //             nombre: nombre || undefined,
    //             baseImponible: baseImponible || undefined,
    //             porcentajeIva: porcentajeIva || undefined,
    //             iva: iva || undefined,
    //             porcentajeRecargo: porcentajeRecargo || undefined,
    //             recargo: recargo || undefined,
    //             porcentajeRetencion: porcentajeRetencion || undefined,
    //             retencion: retencion || undefined,
    //             total: total || undefined,
    //             tipoRegistro: tipoRegistro || undefined,
    //             updatedAt: getNow(),
    //           },
    //         });
    //         summary.savedCount++;
    //         console.log(`✅ [Facturas JSON] Saved factura: ${facturaStr}`);
    //       } catch (err: any) {
    //         summary.failedCount++;
    //         console.error(`❌ [Facturas JSON] Failed saving factura: ${facturaStr} - Error:`, err.message);
    //         summary.errors.push({ itemIndex: i + 1, id: facturaStr, error: err.message });
    //       }
    //     }
    //   }

    //   console.log(`\n🏁 [JSON Execution Summary] Total: ${summary.totalReceived} | Saved: ${summary.savedCount} | Failed: ${summary.failedCount}`);
    //   if (summary.errors.length > 0) {
    //     console.log('⚠️ Issues encountered:', summary.errors);
    //   }
    //   console.log('==================================================================================\n');

    //   res.status(200).json({
    //     status: 'success',
    //     message: 'Webhook processed successfully',
    //     summary,
    //   });
  } catch (error: any) {
    console.error('💥 Fatal Error processing webhook:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process webhook',
      error: error.message,
      summary,
    });
  }
};