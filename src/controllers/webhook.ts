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
    console.log('🔍 Raw Payload Summary:', {
      keys: payload ? Object.keys(payload) : [],
      isCsv: payload?.format === 'csv',
      dataLength: typeof payload?.data === 'string' ? payload.data.length : undefined,
      clientesCount: Array.isArray(payload?.clientes) ? payload.clientes.length : undefined,
      articulosCount: Array.isArray(payload?.articulos) ? payload.articulos.length : undefined,
      proveedoresCount: Array.isArray(payload?.proveedores) ? payload.proveedores.length : undefined,
      facturasCount: Array.isArray(payload?.facturas) ? payload.facturas.length : undefined,
    });

    const now = new Date();

    // Helper to parse simple CSV string if needed
    const parseCsv = (csvData: string) => {
      const lines = csvData.trim().split('\n').slice(1); // skip header
      return lines.map(line => {
        const vals = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') {
            inQuotes = !inQuotes;
          } else if (line[i] === ',' && !inQuotes) {
            vals.push(cur);
            cur = '';
          } else {
            cur += line[i];
          }
        }
        vals.push(cur);
        return vals;
      });
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 1. CSV FORMAT PROCESSING
    // ──────────────────────────────────────────────────────────────────────────
    if (payload.format === 'csv' && typeof payload.data === 'string') {
      const rows = parseCsv(payload.data);
      summary.totalReceived = rows.length;
      console.log(`📊 Processing CSV with ${rows.length} rows for model: ${payload.type}`);

      if (payload.type === 'clientes') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row[0]) {
            console.warn(`⚠️ [Clientes CSV Row ${i + 1}] Skipped: Missing ID in column 0`);
            continue;
          }
          const clientId = parseInt(row[0]);
          if (isNaN(clientId)) {
            summary.failedCount++;
            const errStr = `Invalid numeric ID: "${row[0]}"`;
            console.error(`❌ [Clientes CSV Row ${i + 1}] Error: ${errStr}`);
            summary.errors.push({ itemIndex: i + 1, id: row[0], error: errStr });
            continue;
          }

          try {
            await db.orm.public.Clientes.upsert({
              create: {
                cliente: clientId,
                nombre: row[1] || null,
                razonComercial: row[2] || null,
                direccion: row[3] || null,
                cPostal: row[4] || null,
                poblacion: row[5] || null,
                provincia: row[6] || null,
                cif: row[7] || null,
                telefono: row[8] || null,
                email: row[9] || null,
                fechaAlta: row[10] || null,
                fechaBaja: row[11] || null,
                formaPago: row[12] || null,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                nombre: row[1] || null,
                razonComercial: row[2] || null,
                direccion: row[3] || null,
                cPostal: row[4] || null,
                poblacion: row[5] || null,
                provincia: row[6] || null,
                cif: row[7] || null,
                telefono: row[8] || null,
                email: row[9] || null,
                fechaAlta: row[10] || null,
                fechaBaja: row[11] || null,
                formaPago: row[12] || null,
                updatedAt: now,
              }
            });
            summary.savedCount++;
            console.log(`✅ [Clientes CSV] Saved clientId: ${clientId} (${row[1] || 'No Name'})`);
          } catch (err: any) {
            summary.failedCount++;
            console.error(`❌ [Clientes CSV] Failed saving clientId: ${clientId} - Error:`, err.message);
            summary.errors.push({ itemIndex: i + 1, id: clientId, error: err.message });
          }
        }
      } else if (payload.type === 'articulos') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const articuloCode = row[0]?.trim();
          if (!articuloCode) {
            console.warn(`⚠️ [Articulos CSV Row ${i + 1}] Skipped: Missing article code`);
            continue;
          }

          try {
            await db.orm.public.Articulos.upsert({
              create: {
                articulo: articuloCode,
                nombreArticulo: row[1] || null,
                col01: row[2] || null,
                col02: row[3] || null,
                col03: row[4] || null,
                tipoRegistro: row[5] || null,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                nombreArticulo: row[1] || null,
                col01: row[2] || null,
                col02: row[3] || null,
                col03: row[4] || null,
                tipoRegistro: row[5] || null,
                updatedAt: now,
              }
            });
            summary.savedCount++;
            console.log(`✅ [Articulos CSV] Saved articulo: ${articuloCode} (${row[1] || ''})`);
          } catch (err: any) {
            summary.failedCount++;
            console.error(`❌ [Articulos CSV] Failed saving articulo: ${articuloCode} - Error:`, err.message);
            summary.errors.push({ itemIndex: i + 1, id: articuloCode, error: err.message });
          }
        }
      } else if (payload.type === 'proveedores') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row[0]) {
            console.warn(`⚠️ [Proveedores CSV Row ${i + 1}] Skipped: Missing ID`);
            continue;
          }
          const pId = parseInt(row[0]);
          if (isNaN(pId)) {
            summary.failedCount++;
            const errStr = `Invalid numeric ID: "${row[0]}"`;
            console.error(`❌ [Proveedores CSV Row ${i + 1}] Error: ${errStr}`);
            summary.errors.push({ itemIndex: i + 1, id: row[0], error: errStr });
            continue;
          }

          try {
            await db.orm.public.Proveedores.upsert({
              create: {
                proveedor: pId,
                nombre: row[1] || null,
                razonComercial: row[2] || null,
                direccion: row[3] || null,
                cPostal: row[4] || null,
                poblacion: row[5] || null,
                provincia: row[6] || null,
                cif: row[7] || null,
                telefono: row[8] || null,
                email: row[9] || null,
                formaPago: row[10] || null,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                nombre: row[1] || null,
                razonComercial: row[2] || null,
                direccion: row[3] || null,
                cPostal: row[4] || null,
                poblacion: row[5] || null,
                provincia: row[6] || null,
                cif: row[7] || null,
                telefono: row[8] || null,
                email: row[9] || null,
                formaPago: row[10] || null,
                updatedAt: now,
              }
            });
            summary.savedCount++;
            console.log(`✅ [Proveedores CSV] Saved proveedorId: ${pId} (${row[1] || ''})`);
          } catch (err: any) {
            summary.failedCount++;
            console.error(`❌ [Proveedores CSV] Failed saving proveedorId: ${pId} - Error:`, err.message);
            summary.errors.push({ itemIndex: i + 1, id: pId, error: err.message });
          }
        }
      } else if (payload.type === 'facturas') {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const facturaCode = row[0]?.trim();
          if (!facturaCode) {
            console.warn(`⚠️ [Facturas CSV Row ${i + 1}] Skipped: Missing invoice code`);
            continue;
          }

          try {
            await db.orm.public.Facturas.upsert({
              create: {
                factura: facturaCode,
                nFraExp: row[1] || null,
                fecha: row[2] || null,
                cliente: row[3] || null,
                nombre: row[4] || null,
                baseImponible: row[5] || null,
                porcentajeIva: row[6] || null,
                iva: row[7] || null,
                porcentajeRecargo: row[8] || null,
                recargo: row[9] || null,
                porcentajeRetencion: row[10] || null,
                retencion: row[11] || null,
                total: row[12] || null,
                tipoRegistro: row[13] || null,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                nFraExp: row[1] || null,
                fecha: row[2] || null,
                cliente: row[3] || null,
                nombre: row[4] || null,
                baseImponible: row[5] || null,
                porcentajeIva: row[6] || null,
                iva: row[7] || null,
                porcentajeRecargo: row[8] || null,
                recargo: row[9] || null,
                porcentajeRetencion: row[10] || null,
                retencion: row[11] || null,
                total: row[12] || null,
                tipoRegistro: row[13] || null,
                updatedAt: now,
              }
            });
            summary.savedCount++;
            console.log(`✅ [Facturas CSV] Saved factura: ${facturaCode} (${row[4] || ''})`);
          } catch (err: any) {
            summary.failedCount++;
            console.error(`❌ [Facturas CSV] Failed saving factura: ${facturaCode} - Error:`, err.message);
            summary.errors.push({ itemIndex: i + 1, id: facturaCode, error: err.message });
          }
        }
      }

      console.log(`\n🏁 [CSV Execution Summary] Total: ${summary.totalReceived} | Saved: ${summary.savedCount} | Failed: ${summary.failedCount}`);
      return res.status(200).json({
        status: 'success',
        message: `Processed CSV for ${payload.type}`,
        summary,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. JSON ARRAY FORMAT PROCESSING
    // ──────────────────────────────────────────────────────────────────────────
    if (payload.clientes && Array.isArray(payload.clientes)) {
      summary.totalReceived += payload.clientes.length;
      for (let i = 0; i < payload.clientes.length; i++) {
        const item = payload.clientes[i];
        const clienteNum = Number(item.cliente);
        if (isNaN(clienteNum)) {
          summary.failedCount++;
          const errStr = `Invalid numeric ID: "${item.cliente}"`;
          console.error(`❌ [Clientes JSON Item ${i + 1}] Error: ${errStr}`);
          summary.errors.push({ itemIndex: i + 1, id: item.cliente, error: errStr });
          continue;
        }
        try {
          const { cliente, createdAt, updatedAt, ...rest } = item;
          await db.orm.public.Clientes.upsert({
            create: { ...rest, cliente: clienteNum, createdAt: now, updatedAt: now },
            update: { ...rest, updatedAt: now },
          });
          summary.savedCount++;
          console.log(`✅ [Clientes JSON] Saved cliente: ${clienteNum}`);
        } catch (err: any) {
          summary.failedCount++;
          console.error(`❌ [Clientes JSON] Failed saving cliente: ${clienteNum} - Error:`, err.message);
          summary.errors.push({ itemIndex: i + 1, id: clienteNum, error: err.message });
        }
      }
    }

    if (payload.articulos && Array.isArray(payload.articulos)) {
      summary.totalReceived += payload.articulos.length;
      for (let i = 0; i < payload.articulos.length; i++) {
        const item = payload.articulos[i];
        const articuloStr = String(item.articulo || '').trim();
        if (!articuloStr) {
          summary.failedCount++;
          const errStr = 'Missing article identifier';
          console.error(`❌ [Articulos JSON Item ${i + 1}] Error: ${errStr}`);
          summary.errors.push({ itemIndex: i + 1, error: errStr });
          continue;
        }
        try {
          const { articulo, createdAt, updatedAt, ...rest } = item;
          await db.orm.public.Articulos.upsert({
            create: { ...rest, articulo: articuloStr, createdAt: now, updatedAt: now },
            update: { ...rest, updatedAt: now },
          });
          summary.savedCount++;
          console.log(`✅ [Articulos JSON] Saved articulo: ${articuloStr}`);
        } catch (err: any) {
          summary.failedCount++;
          console.error(`❌ [Articulos JSON] Failed saving articulo: ${articuloStr} - Error:`, err.message);
          summary.errors.push({ itemIndex: i + 1, id: articuloStr, error: err.message });
        }
      }
    }

    if (payload.proveedores && Array.isArray(payload.proveedores)) {
      summary.totalReceived += payload.proveedores.length;
      for (let i = 0; i < payload.proveedores.length; i++) {
        const item = payload.proveedores[i];
        const proveedorNum = Number(item.proveedor);
        if (isNaN(proveedorNum)) {
          summary.failedCount++;
          const errStr = `Invalid numeric ID: "${item.proveedor}"`;
          console.error(`❌ [Proveedores JSON Item ${i + 1}] Error: ${errStr}`);
          summary.errors.push({ itemIndex: i + 1, id: item.proveedor, error: errStr });
          continue;
        }
        try {
          const { proveedor, createdAt, updatedAt, ...rest } = item;
          await db.orm.public.Proveedores.upsert({
            create: { ...rest, proveedor: proveedorNum, createdAt: now, updatedAt: now },
            update: { ...rest, updatedAt: now },
          });
          summary.savedCount++;
          console.log(`✅ [Proveedores JSON] Saved proveedor: ${proveedorNum}`);
        } catch (err: any) {
          summary.failedCount++;
          console.error(`❌ [Proveedores JSON] Failed saving proveedor: ${proveedorNum} - Error:`, err.message);
          summary.errors.push({ itemIndex: i + 1, id: proveedorNum, error: err.message });
        }
      }
    }

    if (payload.facturas && Array.isArray(payload.facturas)) {
      summary.totalReceived += payload.facturas.length;
      for (let i = 0; i < payload.facturas.length; i++) {
        const item = payload.facturas[i];
        const facturaStr = String(item.factura || '').trim();
        if (!facturaStr) {
          summary.failedCount++;
          const errStr = 'Missing invoice identifier';
          console.error(`❌ [Facturas JSON Item ${i + 1}] Error: ${errStr}`);
          summary.errors.push({ itemIndex: i + 1, error: errStr });
          continue;
        }
        try {
          const { factura, createdAt, updatedAt, ...rest } = item;
          await db.orm.public.Facturas.upsert({
            create: { ...rest, factura: facturaStr, createdAt: now, updatedAt: now },
            update: { ...rest, updatedAt: now },
          });
          summary.savedCount++;
          console.log(`✅ [Facturas JSON] Saved factura: ${facturaStr}`);
        } catch (err: any) {
          summary.failedCount++;
          console.error(`❌ [Facturas JSON] Failed saving factura: ${facturaStr} - Error:`, err.message);
          summary.errors.push({ itemIndex: i + 1, id: facturaStr, error: err.message });
        }
      }
    }

    console.log(`\n🏁 [JSON Execution Summary] Total: ${summary.totalReceived} | Saved: ${summary.savedCount} | Failed: ${summary.failedCount}`);
    if (summary.errors.length > 0) {
      console.log('⚠️ Issues encountered:', summary.errors);
    }
    console.log('==================================================================================\n');

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      summary,
    });
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
