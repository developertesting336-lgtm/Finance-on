import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

/**
 * Helper to generate the next 4-digit zero-padded company ID (e.g. "0001", "0002", ...)
 */
const generateNextCompanyId = async (): Promise<string> => {
  const companies = await db.orm.public.Company.select('id').all();
  
  let maxNum = 0;
  for (const c of companies) {
    // If the ID is numeric (e.g. "0001", "0007", "42")
    const parsed = parseInt(c.id, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  const nextNum = maxNum + 1;
  return String(nextNum).padStart(4, '0');
};

/**
 * 1. POST /api/companies (Protected with authenticateToken)
 * Create a company with auto-generated ID (if not provided) or explicit ID, and required name.
 * Also supports optional fields: baseCurrency, erpMapping, status, taxId, timezone.
 */
export const createCompany = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      id,
      name,
      baseCurrency,
      base_currency,
      taxId,
      tax_id,
      timezone,
      status,
      erpMapping,
      erp_mapping,
    } = req.body;

    // Validate required field: name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        message: 'Validation error: Company name is required and must be a non-empty string',
      });
    }

    const companyName = name.trim();

    // Determine companyId: use provided id or auto-generate
    let companyId: string;
    if (id && typeof id === 'string' && id.trim()) {
      companyId = id.trim();
      // Check if company with this explicit id already exists
      const existingCompany = await db.orm.public.Company
        .where({ id: companyId })
        .first();

      if (existingCompany) {
        return res.status(409).json({
          message: `Company with id '${companyId}' already exists`,
        });
      }
    } else {
      companyId = await generateNextCompanyId();
    }

    // Validate status if provided (must be 'Active' or 'Inactive')
    const finalStatus = (status !== undefined && status !== null) ? String(status).trim() : 'Active';
    if (finalStatus !== 'Active' && finalStatus !== 'Inactive') {
      return res.status(400).json({
        message: "Validation error: status must be either 'Active' or 'Inactive'",
      });
    }

    const now = Temporal.Now.instant();
    const resolvedBaseCurrency = baseCurrency ?? base_currency ?? null;
    const resolvedTaxId = taxId ?? tax_id ?? null;
    const resolvedTimezone = timezone ?? null;
    const resolvedErpMapping = erpMapping ?? erp_mapping ?? null;

    const newCompany = await db.orm.public.Company.create({
      id: companyId,
      name: companyName,
      status: finalStatus,
      baseCurrency: resolvedBaseCurrency,
      taxId: resolvedTaxId,
      timezone: resolvedTimezone,
      erpMapping: resolvedErpMapping,
      updatedAt: now,
    });

    return res.status(201).json({
      message: 'Company created successfully',
      company: newCompany,
    });
  } catch (error: any) {
    console.error('Error creating company:', error);
    return res.status(500).json({
      message: 'Error creating company',
      error: error.message,
    });
  }
};

/**
 * 2. GET /api/companies (Protected with authenticateToken)
 * Returns all companies.
 * If non-admin user has specific companyIds assigned, filters by their scope.
 */
export const getCompanies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const isAdmin = user?.role === 'Admin';
    const userCompanyIds = user?.companyIds;

    let companies;

    if (isAdmin || !userCompanyIds || userCompanyIds.length === 0) {
      // Admin or global scope: fetch all companies
      companies = await db.orm.public.Company
        .orderBy((c) => c.name.asc())
        .all();
    } else {
      // Filter by authorized company IDs for scoped users
      companies = await db.orm.public.Company
        .where((c) => c.id.in(userCompanyIds as string[]))
        .orderBy((c) => c.name.asc())
        .all();
    }

    return res.json({
      companies,
      total: companies.length,
    });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return res.status(500).json({
      message: 'Error fetching companies',
      error: error.message,
    });
  }
};
