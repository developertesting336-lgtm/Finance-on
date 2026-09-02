import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook payload received. Processing type:', payload.type);

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

    // If it's the raw CSV string mapping
    if (payload.format === 'csv' && typeof payload.data === 'string') {
      const rows = parseCsv(payload.data);

      if (payload.type === 'clientes') {
        for (const row of rows) {
          if (!row[0]) continue;
          const clientId = parseInt(row[0]);
          if (isNaN(clientId)) continue;

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
        }
      } else if (payload.type === 'articulos') {
        for (const row of rows) {
          if (!row[0]) continue;
          await db.orm.public.Articulos.upsert({
            create: {
              articulo: row[0],
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
        }
      } else if (payload.type === 'proveedores') {
        for (const row of rows) {
          if (!row[0]) continue;
          const pId = parseInt(row[0]);
          if (isNaN(pId)) continue;
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
        }
      } else if (payload.type === 'facturas') {
        for (const row of rows) {
          if (!row[0]) continue;
          await db.orm.public.Facturas.upsert({
            create: {
              factura: row[0],
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
        }
      }

      return res.status(200).json({ status: 'success', message: `Processed CSV for ${payload.type}` });
    }

    // Otherwise assume standard JSON arrays
    if (payload.clientes && Array.isArray(payload.clientes)) {
      for (const item of payload.clientes) {
        const clienteNum = Number(item.cliente);
        if (isNaN(clienteNum)) continue;
        const { cliente, createdAt, updatedAt, ...rest } = item;
        await db.orm.public.Clientes.upsert({
          create: { ...rest, cliente: clienteNum, createdAt: now, updatedAt: now },
          update: { ...rest, updatedAt: now },
        });
      }
    }
    if (payload.articulos && Array.isArray(payload.articulos)) {
      for (const item of payload.articulos) {
        const articuloStr = String(item.articulo);
        if (!articuloStr) continue;
        const { articulo, createdAt, updatedAt, ...rest } = item;
        await db.orm.public.Articulos.upsert({
          create: { ...rest, articulo: articuloStr, createdAt: now, updatedAt: now },
          update: { ...rest, updatedAt: now },
        });
      }
    }
    if (payload.proveedores && Array.isArray(payload.proveedores)) {
      for (const item of payload.proveedores) {
        const proveedorNum = Number(item.proveedor);
        if (isNaN(proveedorNum)) continue;
        const { proveedor, createdAt, updatedAt, ...rest } = item;
        await db.orm.public.Proveedores.upsert({
          create: { ...rest, proveedor: proveedorNum, createdAt: now, updatedAt: now },
          update: { ...rest, updatedAt: now },
        });
      }
    }
    if (payload.facturas && Array.isArray(payload.facturas)) {
      for (const item of payload.facturas) {
        const facturaStr = String(item.factura);
        if (!facturaStr) continue;
        const { factura, createdAt, updatedAt, ...rest } = item;
        await db.orm.public.Facturas.upsert({
          create: { ...rest, factura: facturaStr, createdAt: now, updatedAt: now },
          update: { ...rest, updatedAt: now },
        });
      }
    }

    res.status(200).json({ status: 'success', message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ status: 'error', message: 'Failed to process webhook', error: error.message });
  }
};
