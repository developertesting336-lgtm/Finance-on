import type { Response } from 'express';
import { db } from '../prisma/db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

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
 * Helper to parse entry dates from Asientos table
 */
const parseEntryDate = (val: any): Date | null => {
  if (!val) return null;
  try {
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const strVal = typeof val === 'object' && typeof val.toString === 'function' ? val.toString() : String(val);
    const d = new Date(strVal);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/**
 * Extract fiscal year from Asientos entry
 */
const getEntryYear = (entry: { fecha?: any; created?: any }): number | null => {
  if (entry.fecha) {
    const str = String(entry.fecha).trim();
    // Check YYYY-MM-DD or YYYYMMDD
    const matchY = str.match(/^(\d{4})/);
    if (matchY) {
      const y = parseInt(matchY[1], 10);
      if (y >= 1900 && y <= 2100) return y;
    }
    // Check DD/MM/YYYY
    const matchEnd = str.match(/(\d{4})$/);
    if (matchEnd) {
      const y = parseInt(matchEnd[1], 10);
      if (y >= 1900 && y <= 2100) return y;
    }
  }

  const dateObj = parseEntryDate(entry.created);
  if (dateObj) return dateObj.getFullYear();

  return null;
};

/**
 * Helper to resolve and validate company scope for the requesting user.
 */
const resolveCompanyScope = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<{
  isHolding: boolean;
  targetCompanyId: string | null;
  scopedCompanyIds: string[];
  subcompanyCode: string | null;
} | null> => {
  const rawCompanyId = req.query.companyId ?? req.query.company_id;
  const companyIdParam = typeof rawCompanyId === 'string' ? rawCompanyId.trim() : '';

  const rawSubcompany =
    req.query.subcompanyCode ??
    req.query.subcompany_code ??
    req.query.empresaCode ??
    req.query.empresa_code ??
    req.query.empresa ??
    req.query.codigo ??
    req.query.subcompany;
  const subcompanyCodeParam =
    typeof rawSubcompany === 'string' && rawSubcompany.trim() && rawSubcompany.trim().toLowerCase() !== 'all'
      ? rawSubcompany.trim()
      : null;

  const isHolding =
    !companyIdParam ||
    companyIdParam.toLowerCase() === 'all' ||
    companyIdParam.toLowerCase() === 'holding';
  const isAdmin = req.user?.role === 'Admin';

  if (isHolding && !isAdmin) {
    const userCompanyIds = (req.user?.companyIds as string[]) || [];
    if (userCompanyIds.length === 0) {
      res.status(403).json({
        message: 'Access denied: You do not have permission to view companies.',
      });
      return null;
    }
    return {
      isHolding: true,
      targetCompanyId: null,
      scopedCompanyIds: userCompanyIds,
      subcompanyCode: subcompanyCodeParam,
    };
  }

  if (isHolding) {
    const allCompanies = await db.orm.public.Company.all();
    return {
      isHolding: true,
      targetCompanyId: null,
      scopedCompanyIds: allCompanies.map((c) => c.id),
      subcompanyCode: subcompanyCodeParam,
    };
  }

  // Single company request
  if (!isAdmin) {
    const userCompanyIds = (req.user?.companyIds as string[]) || [];
    if (!userCompanyIds.includes(companyIdParam)) {
      res.status(403).json({
        message: `Access denied: You do not have permission to view company ${companyIdParam}.`,
      });
      return null;
    }
  }

  return {
    isHolding: false,
    targetCompanyId: companyIdParam,
    scopedCompanyIds: [companyIdParam],
    subcompanyCode: subcompanyCodeParam,
  };
};

/**
 * Format YoY percentage string
 */
const formatYoY = (curr: number, prev: number): string => {
  if (!prev || prev === 0) {
    if (curr > 0) return '+100%';
    if (curr < 0) return '-100%';
    return '0.0%';
  }
  const diff = ((curr - prev) / Math.abs(prev)) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
};

/**
 * Calculate standard P&L items from an array of Asientos entries
 */
interface PnLSummary {
  ingresos: number;
  aprovisionamientos: number;
  margenBruto: number;
  gastosPersonal: number;
  opex: number;
  ebitda: number;
  amortizaciones: number;
  ebit: number;
  resultadoFinanciero: number;
  ebt: number;
  impuestos: number;
  resultadoNeto: number;
}

const calculatePnLFromEntries = (entries: any[]): PnLSummary => {
  let ingresos = 0; // 70, 71, 75: haber - debe
  let aprovisionamientos = 0; // 60: debe - haber (represented as negative expense)
  let gastosPersonal = 0; // 64: debe - haber (negative expense)
  let opex = 0; // 62: debe - haber (negative expense)
  let amortizaciones = 0; // 68: debe - haber (negative expense)
  let ingresosFinancieros = 0; // 76: haber - debe
  let gastosFinancieros = 0; // 66: debe - haber
  let impuestos = 0; // 63: debe - haber (negative expense)

  for (const entry of entries) {
    const cta = String(entry.cuenta || '').trim();
    if (!cta) continue;

    const debe = parseSafeNumber(entry.debe);
    const haber = parseSafeNumber(entry.haber);

    if (cta.startsWith('70') || cta.startsWith('71') || cta.startsWith('75')) {
      ingresos += (haber - debe);
    } else if (cta.startsWith('60')) {
      aprovisionamientos += (debe - haber);
    } else if (cta.startsWith('64')) {
      gastosPersonal += (debe - haber);
    } else if (cta.startsWith('62')) {
      opex += (debe - haber);
    } else if (cta.startsWith('68')) {
      amortizaciones += (debe - haber);
    } else if (cta.startsWith('76')) {
      ingresosFinancieros += (haber - debe);
    } else if (cta.startsWith('66')) {
      gastosFinancieros += (debe - haber);
    } else if (cta.startsWith('63')) {
      impuestos += (debe - haber);
    }
  }

  const margenBruto = ingresos - aprovisionamientos;
  const ebitda = margenBruto - gastosPersonal - opex;
  const ebit = ebitda - amortizaciones;
  const resultadoFinanciero = ingresosFinancieros - gastosFinancieros;
  const ebt = ebit + resultadoFinanciero;
  const resultadoNeto = ebt - impuestos;

  return {
    ingresos: Math.round(ingresos),
    aprovisionamientos: -Math.round(aprovisionamientos),
    margenBruto: Math.round(margenBruto),
    gastosPersonal: -Math.round(gastosPersonal),
    opex: -Math.round(opex),
    ebitda: Math.round(ebitda),
    amortizaciones: -Math.round(amortizaciones),
    ebit: Math.round(ebit),
    resultadoFinanciero: Math.round(resultadoFinanciero),
    ebt: Math.round(ebt),
    impuestos: -Math.round(impuestos),
    resultadoNeto: Math.round(resultadoNeto),
  };
};

/**
 * 1. GET /api/results/pnl
 * Cuenta de Pérdidas y Ganancias (P&L) for current year and previous year
 */
export const getPnL = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = await resolveCompanyScope(req, res);
    if (!scope) return;

    const { scopedCompanyIds, subcompanyCode } = scope;
    const currentYear = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const prevYear = currentYear - 1;

    let query = db.orm.public.Asientos
      .where((a) => a.companyId.in(scopedCompanyIds));

    if (subcompanyCode) {
      query = query.where((a) => a.empresa.eq(subcompanyCode as any));
    }

    const allEntries = await query
      .select('cuenta', 'debe', 'haber', 'fecha', 'created')
      .all();

    const currentYearEntries: any[] = [];
    const prevYearEntries: any[] = [];

    for (const entry of allEntries) {
      const y = getEntryYear(entry);
      if (y === currentYear) {
        currentYearEntries.push(entry);
      } else if (y === prevYear) {
        prevYearEntries.push(entry);
      }
    }

    const curr = calculatePnLFromEntries(currentYearEntries);
    const prev = calculatePnLFromEntries(prevYearEntries);

    const response = {
      kpis: {
        revenue: curr.ingresos,
        grossMargin: curr.margenBruto,
        ebitda: curr.ebitda,
        netIncome: curr.resultadoNeto,
        revenueYoY: formatYoY(curr.ingresos, prev.ingresos),
        ebitdaYoY: formatYoY(curr.ebitda, prev.ebitda),
      },
      rows: [
        { concept: 'Ingresos de explotación', y: curr.ingresos, prev: prev.ingresos, base: true },
        { concept: 'Aprovisionamientos', y: curr.aprovisionamientos, prev: prev.aprovisionamientos },
        { concept: 'Margen bruto', y: curr.margenBruto, prev: prev.margenBruto, bold: true },
        { concept: 'Gastos de personal', y: curr.gastosPersonal, prev: prev.gastosPersonal },
        { concept: 'OPEX', y: curr.opex, prev: prev.opex },
        { concept: 'EBITDA', y: curr.ebitda, prev: prev.ebitda, bold: true },
        { concept: 'Amortizaciones', y: curr.amortizaciones, prev: prev.amortizaciones },
        { concept: 'EBIT', y: curr.ebit, prev: prev.ebit, bold: true },
        { concept: 'Resultado financiero', y: curr.resultadoFinanciero, prev: prev.resultadoFinanciero },
        { concept: 'EBT', y: curr.ebt, prev: prev.ebt, bold: true },
        { concept: 'Impuestos', y: curr.impuestos, prev: prev.impuestos },
        { concept: 'RESULTADO NETO', y: curr.resultadoNeto, prev: prev.resultadoNeto, total: true },
      ],
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Error in getPnL:', error);
    return res.status(500).json({ message: 'Error computing P&L', error: error.message });
  }
};

/**
 * 2. GET /api/results/balance
 * Balance de Situación (Activo, Pasivo y Patrimonio Neto)
 */
export const getBalance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = await resolveCompanyScope(req, res);
    if (!scope) return;

    const { scopedCompanyIds, subcompanyCode } = scope;
    const targetYear = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    let query = db.orm.public.Asientos
      .where((a) => a.companyId.in(scopedCompanyIds));

    if (subcompanyCode) {
      query = query.where((a) => a.empresa.eq(subcompanyCode as any));
    }

    const allEntries = await query
      .select('cuenta', 'debe', 'haber', 'fecha', 'created')
      .all();

    // Activo items: standard balance is (debe - haber)
    let inmovilizadoIntangible = 0; // 20, 21
    let inmovilizadoMaterial = 0; // 21-29 minus 28
    let existencias = 0; // 30-39
    let clientes = 0; // 43, 44
    let efectivo = 0; // 57

    // Pasivo / Patrimonio items: standard balance is (haber - debe)
    let capitalReservas = 0; // 10, 11, 12
    let resultadoEjercicio = 0; // Group 6 & 7 or 129
    let pasivoNoCorriente = 0; // 17
    let deudaFinancieraCP = 0; // 52
    let proveedores = 0; // 40, 41
    let otrosPasivosCorrientes = 0; // 47

    for (const entry of allEntries) {
      const y = getEntryYear(entry);
      // Cumulative balance up to targetYear
      if (y !== null && y > targetYear) continue;

      const cta = String(entry.cuenta || '').trim();
      if (!cta) continue;

      const debe = parseSafeNumber(entry.debe);
      const haber = parseSafeNumber(entry.haber);

      // Activo No Corriente
      if (cta.startsWith('20')) {
        inmovilizadoIntangible += (debe - haber);
      } else if (cta.startsWith('28')) {
        // Amortización acumulada reduces inmovilizado material
        inmovilizadoMaterial += (debe - haber);
      } else if (cta.startsWith('2')) {
        inmovilizadoMaterial += (debe - haber);
      }

      // Activo Corriente
      else if (cta.startsWith('3')) {
        existencias += (debe - haber);
      } else if (cta.startsWith('43') || cta.startsWith('44')) {
        clientes += (debe - haber);
      } else if (cta.startsWith('57')) {
        efectivo += (debe - haber);
      }

      // Patrimonio Neto
      else if (cta.startsWith('10') || cta.startsWith('11') || cta.startsWith('120') || cta.startsWith('121')) {
        capitalReservas += (haber - debe);
      } else if (cta.startsWith('129')) {
        resultadoEjercicio += (haber - debe);
      }

      // Pasivo No Corriente
      else if (cta.startsWith('17')) {
        pasivoNoCorriente += (haber - debe);
      }

      // Pasivo Corriente
      else if (cta.startsWith('52')) {
        deudaFinancieraCP += (haber - debe);
      } else if (cta.startsWith('40') || cta.startsWith('41')) {
        proveedores += (haber - debe);
      } else if (cta.startsWith('47')) {
        otrosPasivosCorrientes += (haber - debe);
      }

      // If year equals targetYear and account is in group 6 or 7, accumulate to current year result if 129 not booked
      if (y === targetYear) {
        if (cta.startsWith('7')) {
          resultadoEjercicio += (haber - debe);
        } else if (cta.startsWith('6')) {
          resultadoEjercicio -= (debe - haber);
        }
      }
    }

    // Rounding & clean numbers
    inmovilizadoIntangible = Math.max(0, Math.round(inmovilizadoIntangible));
    inmovilizadoMaterial = Math.max(0, Math.round(inmovilizadoMaterial));
    existencias = Math.max(0, Math.round(existencias));
    clientes = Math.max(0, Math.round(clientes));
    efectivo = Math.max(0, Math.round(efectivo));

    capitalReservas = Math.round(capitalReservas);
    resultadoEjercicio = Math.round(resultadoEjercicio);
    pasivoNoCorriente = Math.max(0, Math.round(pasivoNoCorriente));
    deudaFinancieraCP = Math.max(0, Math.round(deudaFinancieraCP));
    proveedores = Math.max(0, Math.round(proveedores));
    otrosPasivosCorrientes = Math.max(0, Math.round(otrosPasivosCorrientes));

    const activoNoCorriente = inmovilizadoIntangible + inmovilizadoMaterial;
    const activoCorriente = existencias + clientes + efectivo;
    const totalAssets = activoNoCorriente + activoCorriente;

    const patrimonioNeto = capitalReservas + resultadoEjercicio;
    const pasivoCorriente = deudaFinancieraCP + proveedores + otrosPasivosCorrientes;
    const workingCapital = activoCorriente - pasivoCorriente;
    const liquidityRatio = pasivoCorriente > 0 ? parseFloat((activoCorriente / pasivoCorriente).toFixed(2)) : 1.0;

    const response = {
      kpis: {
        totalAssets,
        equity: patrimonioNeto,
        workingCapital,
        liquidityRatio,
      },
      activo: [
        { concept: 'Activo no corriente', value: activoNoCorriente, bold: true },
        { concept: 'Inmovilizado material', value: inmovilizadoMaterial },
        { concept: 'Inmovilizado intangible', value: inmovilizadoIntangible },
        { concept: 'Activo corriente', value: activoCorriente, bold: true },
        { concept: 'Existencias', value: existencias },
        { concept: 'Clientes', value: clientes },
        { concept: 'Efectivo', value: efectivo },
      ],
      pasivo: [
        { concept: 'Patrimonio neto', value: patrimonioNeto, bold: true },
        { concept: 'Capital y reservas', value: capitalReservas },
        { concept: 'Resultado del ejercicio', value: resultadoEjercicio },
        { concept: 'Pasivo no corriente', value: pasivoNoCorriente, bold: true },
        { concept: 'Deuda financiera l/p', value: pasivoNoCorriente },
        { concept: 'Pasivo corriente', value: pasivoCorriente, bold: true },
        { concept: 'Deuda financiera c/p', value: deudaFinancieraCP },
        { concept: 'Proveedores y acreedores', value: proveedores },
        { concept: 'Otros pasivos corrientes', value: otrosPasivosCorrientes },
      ],
    };

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Error in getBalance:', error);
    return res.status(500).json({ message: 'Error computing Balance Sheet', error: error.message });
  }
};

/**
 * 3. GET /api/results/ratios
 * Financial health & operational ratios
 */
export const getRatios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = await resolveCompanyScope(req, res);
    if (!scope) return;

    const { scopedCompanyIds, subcompanyCode } = scope;
    const targetYear = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    let query = db.orm.public.Asientos
      .where((a) => a.companyId.in(scopedCompanyIds));

    if (subcompanyCode) {
      query = query.where((a) => a.empresa.eq(subcompanyCode as any));
    }

    const allEntries = await query
      .select('cuenta', 'debe', 'haber', 'fecha', 'created')
      .all();

    const yearEntries = allEntries.filter((e) => getEntryYear(e) === targetYear);
    const pnl = calculatePnLFromEntries(yearEntries);

    // Balance calculation
    let activoCorriente = 0;
    let totalActivo = 0;
    let pasivoCorriente = 0;
    let pasivoTotal = 0;
    let patrimonioNeto = 0;
    let gastosFinancieros = 0;

    for (const entry of allEntries) {
      const y = getEntryYear(entry);
      if (y !== null && y > targetYear) continue;

      const cta = String(entry.cuenta || '').trim();
      if (!cta) continue;

      const debe = parseSafeNumber(entry.debe);
      const haber = parseSafeNumber(entry.haber);

      // Activo
      if (cta.startsWith('2') || cta.startsWith('3') || cta.startsWith('43') || cta.startsWith('44') || cta.startsWith('57')) {
        const net = debe - haber;
        totalActivo += net;
        if (cta.startsWith('3') || cta.startsWith('43') || cta.startsWith('44') || cta.startsWith('57')) {
          activoCorriente += net;
        }
      }

      // Pasivo y PN
      if (cta.startsWith('10') || cta.startsWith('11') || cta.startsWith('12')) {
        patrimonioNeto += (haber - debe);
      } else if (cta.startsWith('17')) {
        pasivoTotal += (haber - debe);
      } else if (cta.startsWith('52') || cta.startsWith('40') || cta.startsWith('41') || cta.startsWith('47')) {
        const pNet = haber - debe;
        pasivoCorriente += pNet;
        pasivoTotal += pNet;
      }

      if (y === targetYear && cta.startsWith('66')) {
        gastosFinancieros += (debe - haber);
      }
    }

    // Add Net income to equity if not booked
    patrimonioNeto += pnl.resultadoNeto;

    const safeVentas = pnl.ingresos > 0 ? pnl.ingresos : 1;
    const safeActivo = totalActivo > 0 ? totalActivo : 1;
    const safePatrimonio = patrimonioNeto > 0 ? patrimonioNeto : 1;
    const safePasivoCorriente = pasivoCorriente > 0 ? pasivoCorriente : 1;

    const ebitdaMargin = (pnl.ebitda / safeVentas) * 100;
    const netMargin = (pnl.resultadoNeto / safeVentas) * 100;
    const liquidityRatio = activoCorriente / safePasivoCorriente;
    const debtRatio = (pasivoTotal / safeActivo) * 100;
    const roa = (pnl.ebit / safeActivo) * 100;
    const roe = (pnl.resultadoNeto / safePatrimonio) * 100;
    const debtServiceCoverage = gastosFinancieros > 0 ? pnl.ebitda / gastosFinancieros : (pnl.ebitda > 0 ? 99.9 : 0);
    const workingCapital = activoCorriente - pasivoCorriente;

    const ratios = {
      ebitdaMargin: `${ebitdaMargin.toFixed(1)}%`,
      netMargin: `${netMargin.toFixed(1)}%`,
      liquidityRatio: parseFloat(liquidityRatio.toFixed(2)),
      debtRatio: `${debtRatio.toFixed(1)}%`,
      roa: `${roa.toFixed(1)}%`,
      roe: `${roe.toFixed(1)}%`,
      debtServiceCoverage: parseFloat(debtServiceCoverage.toFixed(2)),
      workingCapital: Math.round(workingCapital),
    };

    return res.status(200).json(ratios);
  } catch (error: any) {
    console.error('Error in getRatios:', error);
    return res.status(500).json({ message: 'Error computing financial ratios', error: error.message });
  }
};

/**
 * 4. GET /api/results/comparison
 * Breakdown comparison by Company and Subcompany
 */
export const getComparison = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scope = await resolveCompanyScope(req, res);
    if (!scope) return;

    const { scopedCompanyIds } = scope;
    const targetYear = parseInt(req.query.year as string, 10) || new Date().getFullYear();

    // Query Empresa and Company metadata for clear naming
    const companies = await db.orm.public.Company
      .where((c) => c.id.in(scopedCompanyIds))
      .select('id', 'name')
      .all();

    const companyMap = new Map<string, string>();
    for (const c of companies) {
      companyMap.set(c.id.trim(), c.name.trim());
    }

    const empresas = await db.orm.public.Empresa
      .where((e) => e.companyId.in(scopedCompanyIds))
      .select('companyId', 'codigo', 'nombre', 'nombre2')
      .all();

    const subcompanyMap = new Map<string, string>();
    for (const emp of empresas) {
      if (emp.companyId && emp.codigo) {
        const key = `${String(emp.companyId).trim()}_${String(emp.codigo).trim()}`;
        const name = emp.nombre ? String(emp.nombre).trim() : (emp.nombre2 ? String(emp.nombre2).trim() : `Empresa ${emp.codigo}`);
        subcompanyMap.set(key, name);
      }
    }

    // Query Asientos for scoped companies
    const entries = await db.orm.public.Asientos
      .where((a) => a.companyId.in(scopedCompanyIds))
      .select('companyId', 'empresa', 'cuenta', 'debe', 'haber', 'fecha', 'created')
      .all();

    // Group entries by entity (companyId + empresa)
    interface EntityAgg {
      companyId: string;
      subcompanyCode: string | null;
      name: string;
      ingresos: number;
      ebitda: number;
      margen: string;
      activos: number;
    }

    const entityMap = new Map<string, { yearEntries: any[]; allEntries: any[] }>();

    for (const entry of entries) {
      if (!entry.companyId) continue;
      const cid = String(entry.companyId).trim();
      const emp = entry.empresa ? String(entry.empresa).trim() : '';
      const key = emp ? `${cid}_${emp}` : cid;

      if (!entityMap.has(key)) {
        entityMap.set(key, { yearEntries: [], allEntries: [] });
      }

      const holder = entityMap.get(key)!;
      holder.allEntries.push(entry);

      const y = getEntryYear(entry);
      if (y === targetYear) {
        holder.yearEntries.push(entry);
      }
    }

    const comparisons: EntityAgg[] = [];

    for (const [key, data] of entityMap.entries()) {
      const parts = key.split('_');
      const cid = parts[0];
      const subCode = parts[1] || null;

      const groupName = companyMap.get(cid) || `Grupo ${cid}`;
      const subName = subCode ? subcompanyMap.get(key) : null;
      const displayName = subName ? `${groupName} - ${subName}` : groupName;

      const pnl = calculatePnLFromEntries(data.yearEntries);

      // Activos up to targetYear
      let activos = 0;
      for (const e of data.allEntries) {
        const y = getEntryYear(e);
        if (y !== null && y > targetYear) continue;

        const cta = String(e.cuenta || '').trim();
        if (cta.startsWith('2') || cta.startsWith('3') || cta.startsWith('43') || cta.startsWith('44') || cta.startsWith('57')) {
          activos += (parseSafeNumber(e.debe) - parseSafeNumber(e.haber));
        }
      }

      const safeVentas = pnl.ingresos > 0 ? pnl.ingresos : 1;
      const margenPercent = ((pnl.ebitda / safeVentas) * 100).toFixed(1) + '%';

      comparisons.push({
        companyId: cid,
        subcompanyCode: subCode,
        name: displayName,
        ingresos: pnl.ingresos,
        ebitda: pnl.ebitda,
        margen: margenPercent,
        activos: Math.max(0, Math.round(activos)),
      });
    }

    // Sort by ingresos descending
    comparisons.sort((a, b) => b.ingresos - a.ingresos);

    return res.status(200).json(comparisons);
  } catch (error: any) {
    console.error('Error in getComparison:', error);
    return res.status(500).json({ message: 'Error computing company comparison', error: error.message });
  }
};
