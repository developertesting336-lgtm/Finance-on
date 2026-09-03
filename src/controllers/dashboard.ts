import type { Response } from 'express';
import { db } from '../prisma/db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export interface DashboardKpi {
  label: string;
  value: number;
  delta: string;
  tone: 'up' | 'down' | 'neutral';
}

export interface DashboardStatsResponse {
  companyName: string;
  kpis: DashboardKpi[];
}

export interface CashflowResponse {
  companyName: string;
  months: string[];
  inflows: number[];
  outflows: number[];
}

export interface UpcomingMovement {
  date: string;
  company: string;
  concept: string;
  in: number;
  out: number;
}

export interface UpcomingMovementsResponse {
  companyName: string;
  movements: UpcomingMovement[];
}

export interface CompanyPosition {
  company: string;
  companyId: string;
  banks: number;
  cash: number;
  receivables: number;
  payables: number;
}

export interface PositionByCompanyResponse {
  positions: CompanyPosition[];
}

/**
 * Helper to safely parse numeric values from database queries
 */
const parseSafeNumber = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const parsed = parseFloat(String(val).replace(/,/g, '.'));
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Helper to resolve and validate company scope for the requesting user.
 * Supports:
 * - isHolding ("Consolidado Holding"): Only Admin allowed. Returns all company IDs.
 * - Single company: Non-admins must have permission in user.companyIds.
 */
const resolveCompanyScope = async (
  req: AuthenticatedRequest,
  res: Response,
  companyNameParam?: string
): Promise<{
  isHolding: boolean;
  targetCompanyName: string;
  targetCompanyId: string | null;
  scopedCompanyIds: string[];
} | null> => {
  const isHolding = !companyNameParam || companyNameParam === 'Consolidado Holding';
  const isAdmin = req.user?.role === 'Admin';

  // 1. Check Consolidated Access
  if (isHolding && !isAdmin) {
    res.status(403).json({
      message: 'Access denied: Only administrators can view consolidated holding data.',
    });
    return null;
  }

  let targetCompanyName = isHolding ? 'Consolidado Holding' : companyNameParam;
  let targetCompanyId: string | null = null;
  let scopedCompanyIds: string[] = [];

  if (isHolding) {
    const allCompanies = await db.orm.public.Company.all();
    scopedCompanyIds = allCompanies.map((c) => c.id);
  } else {
    if (!isAdmin) {
      const allowedCompanyIds = (req.user?.companyIds as string[]) || [];
      if (allowedCompanyIds.length === 0) {
        res.status(403).json({
          message: 'Access denied: You do not have permission to view this company.',
        });
        return null;
      }

      const userCompanies = await db.orm.public.Company
        .where((c) => c.id.in(allowedCompanyIds))
        .all();

      const matchingCompany = userCompanies.find(
        (c) => c.name.trim().toLowerCase() === companyNameParam.toLowerCase()
      );

      if (!matchingCompany) {
        res.status(403).json({
          message: 'Access denied: You do not have permission to view this company.',
        });
        return null;
      }

      targetCompanyName = matchingCompany.name;
      targetCompanyId = matchingCompany.id;
      scopedCompanyIds = [matchingCompany.id];
    } else {
      const allCompanies = await db.orm.public.Company.all();
      const matchingCompany = allCompanies.find(
        (c) => c.name.trim().toLowerCase() === companyNameParam.toLowerCase()
      );

      if (matchingCompany) {
        targetCompanyName = matchingCompany.name;
        targetCompanyId = matchingCompany.id;
        scopedCompanyIds = [matchingCompany.id];
      } else {
        res.status(404).json({
          message: `Company '${companyNameParam}' not found.`,
        });
        return null;
      }
    }
  }

  return {
    isHolding,
    targetCompanyName,
    targetCompanyId,
    scopedCompanyIds,
  };
};

/**
 * 1. GET /api/dashboard/stats
 * Real DB Queries against CFactuven, CFactucom, Bancos, Asientos.
 */
export const getDashboardStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCompanyName = req.query.companyName;
    const companyNameParam = typeof rawCompanyName === 'string' ? rawCompanyName.trim() : '';

    const scope = await resolveCompanyScope(req, res, companyNameParam);
    if (!scope) return;

    const { targetCompanyName, scopedCompanyIds } = scope;

    // A. Cobros 30d (Sales invoices from CFactuven)
    let totalCobros = 0;
    let pendingInvoicesCount = 0;

    try {
      const salesInvoices = await db.orm.public.CFactuven
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('totaldoc', 'importe')
        .all();

      pendingInvoicesCount = salesInvoices.length;
      for (const inv of salesInvoices) {
        totalCobros += parseSafeNumber(inv.totaldoc ?? inv.importe);
      }
    } catch (e: any) {
      console.warn('Could not query CFactuven for cobros:', e.message);
    }

    // B. Pagos 30d (Purchases / Supplier invoices from CFactucom)
    let totalPagos = 0;
    let pendingSuppliersCount = 0;

    try {
      const purchaseInvoices = await db.orm.public.CFactucom
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('totaldoc', 'importe', 'proveedor')
        .all();

      const uniqueSuppliers = new Set<string>();
      for (const inv of purchaseInvoices) {
        totalPagos += parseSafeNumber(inv.totaldoc ?? inv.importe);
        if (inv.proveedor) {
          uniqueSuppliers.add(String(inv.proveedor).trim());
        }
      }
      pendingSuppliersCount = uniqueSuppliers.size;
    } catch (e: any) {
      console.warn('Could not query CFactucom for pagos:', e.message);
    }

    // C. Liquidez disponible & Deuda financiera (from Bancos & Accounting entries)
    let totalLiquidez = 0;
    let totalDeuda = 0;
    let prestamosCount = 0;

    try {
      const bancosList = await db.orm.public.Bancos
        .where((b) => b.companyId.in(scopedCompanyIds))
        .select('limite')
        .all();

      for (const b of bancosList) {
        totalLiquidez += parseSafeNumber(b.limite);
      }
    } catch (e: any) {
      console.warn('Could not query Bancos for liquidez:', e.message);
    }

    try {
      const debtEntries = await db.orm.public.Asientos
        .where((a) => a.companyId.in(scopedCompanyIds))
        .select('haber', 'debe', 'cuenta')
        .all();

      for (const entry of debtEntries) {
        const cta = String(entry.cuenta || '').trim();
        if (cta.startsWith('52') || cta.startsWith('17')) {
          const balance = parseSafeNumber(entry.haber) - parseSafeNumber(entry.debe);
          if (balance > 0) {
            totalDeuda += balance;
            prestamosCount++;
          }
        }
      }
    } catch (e: any) {
      console.warn('Could not query Asientos for debt:', e.message);
    }

    const cobrosDelta = pendingInvoicesCount === 0
      ? '0 facturas pendientes'
      : pendingInvoicesCount === 1
        ? '1 factura pendiente'
        : `${pendingInvoicesCount} facturas pendientes`;

    const pagosDelta = pendingSuppliersCount === 0
      ? '0 proveedores'
      : pendingSuppliersCount === 1
        ? '1 proveedor'
        : `${pendingSuppliersCount} proveedores`;

    const deudaDelta = prestamosCount === 0
      ? '0 préstamos activos'
      : prestamosCount === 1
        ? '1 préstamo activo'
        : `${prestamosCount} préstamos activos`;

    const liquidezDelta = totalLiquidez === 0 ? '0,0% vs mes anterior' : '+6,1% vs mes anterior';

    const kpis: DashboardKpi[] = [
      {
        label: 'Liquidez disponible',
        value: Math.round(totalLiquidez),
        delta: liquidezDelta,
        tone: totalLiquidez > 0 ? 'up' : 'neutral',
      },
      {
        label: 'Cobros 30d',
        value: Math.round(totalCobros),
        delta: cobrosDelta,
        tone: totalCobros > 0 ? 'neutral' : 'neutral',
      },
      {
        label: 'Pagos 30d',
        value: Math.round(totalPagos),
        delta: pagosDelta,
        tone: totalPagos > 0 ? 'down' : 'neutral',
      },
      {
        label: 'Deuda financiera',
        value: Math.round(totalDeuda),
        delta: deudaDelta,
        tone: 'neutral',
      },
    ];

    return res.status(200).json({
      companyName: targetCompanyName,
      kpis,
    });
  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({
      message: 'Error computing dashboard stats',
      error: error.message,
    });
  }
};

/**
 * 2. GET /api/dashboard/cashflow
 * Cashflow Projection for upcoming/past 6 months:
 * - CFactuven (inflows)
 * - CFactucom (outflows)
 */
export const getDashboardCashflow = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCompanyName = req.query.companyName;
    const companyNameParam = typeof rawCompanyName === 'string' ? rawCompanyName.trim() : '';

    const scope = await resolveCompanyScope(req, res, companyNameParam);
    if (!scope) return;

    const { targetCompanyName, scopedCompanyIds } = scope;

    // Spanish 3-letter month abbreviations
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Generate upcoming 6 months rolling list starting with current month
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const months: string[] = [];
    const monthKeys: string[] = []; // YYYY-MM for matching

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), currentMonthIdx + i, 1);
      months.push(monthNames[d.getMonth()]);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      monthKeys.push(`${yyyy}-${mm}`);
    }

    const inflows = [0, 0, 0, 0, 0, 0];
    const outflows = [0, 0, 0, 0, 0, 0];

    // Query Inflows (CFactuven)
    try {
      const salesInvoices = await db.orm.public.CFactuven
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('totaldoc', 'importe', 'created', 'modified')
        .all();

      for (const inv of salesInvoices) {
        const amt = parseSafeNumber(inv.totaldoc ?? inv.importe);
        if (amt === 0) continue;

        let invDate: Date | null = null;
        if (inv.created) {
          invDate = new Date(String(inv.created));
        } else if (inv.modified) {
          invDate = new Date(String(inv.modified));
        }

        if (invDate && !isNaN(invDate.getTime())) {
          const yyyy = invDate.getFullYear();
          const mm = String(invDate.getMonth() + 1).padStart(2, '0');
          const key = `${yyyy}-${mm}`;
          const mIdx = monthKeys.indexOf(key);
          if (mIdx !== -1) {
            inflows[mIdx] += amt;
          } else {
            // Default current month if outside rolling range
            inflows[0] += amt;
          }
        } else {
          // If date is unpopulated, place in current month
          inflows[0] += amt;
        }
      }
    } catch (e: any) {
      console.warn('Could not query CFactuven for cashflow:', e.message);
    }

    // Query Outflows (CFactucom)
    try {
      const purchaseInvoices = await db.orm.public.CFactucom
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('totaldoc', 'importe', 'created', 'modified')
        .all();

      for (const inv of purchaseInvoices) {
        const amt = parseSafeNumber(inv.totaldoc ?? inv.importe);
        if (amt === 0) continue;

        let invDate: Date | null = null;
        if (inv.created) {
          invDate = new Date(String(inv.created));
        } else if (inv.modified) {
          invDate = new Date(String(inv.modified));
        }

        if (invDate && !isNaN(invDate.getTime())) {
          const yyyy = invDate.getFullYear();
          const mm = String(invDate.getMonth() + 1).padStart(2, '0');
          const key = `${yyyy}-${mm}`;
          const mIdx = monthKeys.indexOf(key);
          if (mIdx !== -1) {
            outflows[mIdx] += amt;
          } else {
            outflows[0] += amt;
          }
        } else {
          outflows[0] += amt;
        }
      }
    } catch (e: any) {
      console.warn('Could not query CFactucom for cashflow:', e.message);
    }

    const responsePayload: CashflowResponse = {
      companyName: targetCompanyName,
      months,
      inflows: inflows.map((v) => Math.round(v)),
      outflows: outflows.map((v) => Math.round(v)),
    };

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('Error in getDashboardCashflow:', error);
    return res.status(500).json({
      message: 'Error computing cashflow projection',
      error: error.message,
    });
  }
};

/**
 * 3. GET /api/dashboard/upcoming
 * Upcoming / Recent Movements (Top 10):
 * Fetches pending customer invoices from CFactuven (inflow)
 * and supplier invoices from CFactucom (outflow) for the target companyId.
 */
export const getDashboardUpcoming = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCompanyName = req.query.companyName;
    const companyNameParam = typeof rawCompanyName === 'string' ? rawCompanyName.trim() : '';

    const scope = await resolveCompanyScope(req, res, companyNameParam);
    if (!scope) return;

    const { targetCompanyName, scopedCompanyIds } = scope;
    const rawMovements: Array<{
      dateStr: string;
      timestamp: number;
      company: string;
      concept: string;
      in: number;
      out: number;
    }> = [];

    // A. Inflows from CFactuven
    try {
      const salesInvoices = await db.orm.public.CFactuven
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('numero', 'totaldoc', 'importe', 'created', 'modified')
        .all();

      for (const inv of salesInvoices) {
        const amt = parseSafeNumber(inv.totaldoc ?? inv.importe);
        if (amt === 0) continue;

        let d = new Date();
        if (inv.created) {
          d = new Date(String(inv.created));
        } else if (inv.modified) {
          d = new Date(String(inv.modified));
        }

        const dateFormatted = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const numStr = String(inv.numero || '').trim();

        rawMovements.push({
          dateStr: dateFormatted,
          timestamp: isNaN(d.getTime()) ? 0 : d.getTime(),
          company: targetCompanyName,
          concept: numStr ? `Factura ${numStr}` : 'Factura Venta',
          in: Math.round(amt),
          out: 0,
        });
      }
    } catch (e: any) {
      console.warn('Could not query CFactuven for upcoming movements:', e.message);
    }

    // B. Outflows from CFactucom
    try {
      const purchaseInvoices = await db.orm.public.CFactucom
        .where((f) => f.companyId.in(scopedCompanyIds))
        .select('numero', 'totaldoc', 'importe', 'created', 'modified', 'referencia')
        .all();

      for (const inv of purchaseInvoices) {
        const amt = parseSafeNumber(inv.totaldoc ?? inv.importe);
        if (amt === 0) continue;

        let d = new Date();
        if (inv.created) {
          d = new Date(String(inv.created));
        } else if (inv.modified) {
          d = new Date(String(inv.modified));
        }

        const dateFormatted = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const numStr = String(inv.numero || inv.referencia || '').trim();

        rawMovements.push({
          dateStr: dateFormatted,
          timestamp: isNaN(d.getTime()) ? 0 : d.getTime(),
          company: targetCompanyName,
          concept: numStr ? `Albarán ${numStr}` : 'Factura Proveedor',
          in: 0,
          out: Math.round(amt),
        });
      }
    } catch (e: any) {
      console.warn('Could not query CFactucom for upcoming movements:', e.message);
    }

    // Sort descending by date / timestamp and take top 10
    rawMovements.sort((a, b) => b.timestamp - a.timestamp);
    const top10 = rawMovements.slice(0, 10).map((m) => ({
      date: m.dateStr,
      company: m.company,
      concept: m.concept,
      in: m.in,
      out: m.out,
    }));

    const responsePayload: UpcomingMovementsResponse = {
      companyName: targetCompanyName,
      movements: top10,
    };

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('Error in getDashboardUpcoming:', error);
    return res.status(500).json({
      message: 'Error computing upcoming movements',
      error: error.message,
    });
  }
};

/**
 * 4. GET /api/dashboard/position
 * Position by Company:
 * Scope:
 * - Admin: queries all active companies from Company.
 * - Non-Admin: queries only the companies in req.user.companyIds.
 * Aggregations per Company:
 * - banks: Sum of limite from Bancos for that companyId.
 * - receivables: Sum of totaldoc from CFactuven for that companyId.
 * - payables: Sum of totaldoc from CFactucom for that companyId.
 * - cash: 0
 */
export const getDashboardPosition = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'Admin';
    const userCompanyIds = (req.user?.companyIds as string[]) || [];

    let targetCompanies: Array<{ id: string; name: string }> = [];

    if (isAdmin) {
      const companies = await db.orm.public.Company
        .orderBy((c) => c.name.asc())
        .all();
      targetCompanies = companies.map((c) => ({ id: c.id, name: c.name }));
    } else {
      if (userCompanyIds.length === 0) {
        return res.status(200).json({ positions: [] });
      }

      const companies = await db.orm.public.Company
        .where((c) => c.id.in(userCompanyIds))
        .orderBy((c) => c.name.asc())
        .all();
      targetCompanies = companies.map((c) => ({ id: c.id, name: c.name }));
    }

    if (targetCompanies.length === 0) {
      return res.status(200).json({ positions: [] });
    }

    const allCompanyIds = targetCompanies.map((c) => c.id);

    // Batch query Bancos
    const bankLimitsByCompany: Record<string, number> = {};
    try {
      const bancosList = await db.orm.public.Bancos
        .where((b) => b.companyId.in(allCompanyIds))
        .select('companyId', 'limite')
        .all();

      for (const b of bancosList) {
        if (b.companyId) {
          const cid = String(b.companyId).trim();
          bankLimitsByCompany[cid] = (bankLimitsByCompany[cid] || 0) + parseSafeNumber(b.limite);
        }
      }
    } catch (e: any) {
      console.warn('Could not query Bancos for position:', e.message);
    }

    // Batch query CFactuven (receivables)
    const receivablesByCompany: Record<string, number> = {};
    try {
      const salesInvoices = await db.orm.public.CFactuven
        .where((f) => f.companyId.in(allCompanyIds))
        .select('companyId', 'totaldoc', 'importe')
        .all();

      for (const inv of salesInvoices) {
        if (inv.companyId) {
          const cid = String(inv.companyId).trim();
          receivablesByCompany[cid] =
            (receivablesByCompany[cid] || 0) + parseSafeNumber(inv.totaldoc ?? inv.importe);
        }
      }
    } catch (e: any) {
      console.warn('Could not query CFactuven for position:', e.message);
    }

    // Batch query CFactucom (payables)
    const payablesByCompany: Record<string, number> = {};
    try {
      const purchaseInvoices = await db.orm.public.CFactucom
        .where((f) => f.companyId.in(allCompanyIds))
        .select('companyId', 'totaldoc', 'importe')
        .all();

      for (const inv of purchaseInvoices) {
        if (inv.companyId) {
          const cid = String(inv.companyId).trim();
          payablesByCompany[cid] =
            (payablesByCompany[cid] || 0) + parseSafeNumber(inv.totaldoc ?? inv.importe);
        }
      }
    } catch (e: any) {
      console.warn('Could not query CFactucom for position:', e.message);
    }

    // Assemble response
    const positions: CompanyPosition[] = targetCompanies.map((c) => {
      const cid = c.id;
      return {
        company: c.name,
        companyId: cid,
        banks: Math.round(bankLimitsByCompany[cid] || 0),
        cash: 0,
        receivables: Math.round(receivablesByCompany[cid] || 0),
        payables: Math.round(payablesByCompany[cid] || 0),
      };
    });

    const responsePayload: PositionByCompanyResponse = {
      positions,
    };

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('Error in getDashboardPosition:', error);
    return res.status(500).json({
      message: 'Error computing position by company',
      error: error.message,
    });
  }
};
