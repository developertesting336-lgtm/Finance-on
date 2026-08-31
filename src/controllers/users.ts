import type { Request, Response } from 'express';
import { db } from '../prisma/db.js';
import type { Role } from '../utils/jwt.js';

// Valid roles matching Prisma contract Role enum
const VALID_ROLES: Role[] = ['Admin', 'Management', 'Finance', 'Company Manager', 'Auditor'];

/**
 * Map a role string (case-insensitive) to the exact Role enum value.
 */
const normalizeRole = (roleStr: string): Role | null => {
  const normalized = roleStr.trim().toLowerCase();
  for (const validRole of VALID_ROLES) {
    if (validRole.toLowerCase() === normalized) {
      return validRole;
    }
  }
  // Also check camelCase/PascalCase without space e.g. "companymanager"
  if (normalized === 'companymanager') {
    return 'Company Manager';
  }
  return null;
};

/**
 * Format user for consistent User Management endpoint responses
 */
const formatUserManagement = (user: any) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName ?? user.email.split('@')[0],
  role: user.role,
  companyScope:
    user.companyIds && user.companyIds.length > 0
      ? user.companyIds.join(', ')
      : 'Todas las sociedades',
});

/**
 * 1. GET /api/users (Protected with authenticateToken)
 * Returns all users formatted for the Usuarios management page.
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await db.orm.public.User
      .orderBy((u) => u.id.asc())
      .all();

    return res.json({
      users: users.map(formatUserManagement),
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

/**
 * 2. PATCH /api/users/:id (Protected with authenticateToken)
 * Accepts { role?: string, companyScope?: string }
 * Validates role against Prisma Role enum.
 * Updates user and returns { user: ... }.
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const { role, companyScope } = req.body;

    if (role === undefined && companyScope === undefined) {
      return res.status(400).json({ message: 'No update fields provided (role or companyScope required)' });
    }

    // Check if user exists
    const existingUser = await db.orm.public.User
      .where({ id: userId })
      .first();

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData: Record<string, any> = {};

    // Validate and map role if provided
    if (role !== undefined) {
      if (typeof role !== 'string') {
        return res.status(422).json({ message: 'Role must be a string' });
      }

      const validRole = normalizeRole(role);
      if (!validRole) {
        return res.status(422).json({
          message: `Invalid role '${role}'. Valid roles are: ${VALID_ROLES.join(', ')}`,
        });
      }

      updateData.role = validRole;
    }

    // Handle companyScope if provided
    if (companyScope !== undefined) {
      if (typeof companyScope === 'string') {
        const trimmed = companyScope.trim();
        if (
          trimmed.toLowerCase() === 'todas las sociedades' ||
          trimmed.toLowerCase() === 'all' ||
          trimmed === ''
        ) {
          updateData.companyIds = [];
        } else {
          // Parse numeric IDs if given like "1, 2, 3"
          const parsedIds = trimmed
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));
          updateData.companyIds = parsedIds;
        }
      } else if (Array.isArray(companyScope)) {
        updateData.companyIds = companyScope
          .map((n) => parseInt(n, 10))
          .filter((n) => !isNaN(n));
      }
    }

    let updatedUser: any = existingUser;

    if (Object.keys(updateData).length > 0) {
      await db.orm.public.User
        .where({ id: userId })
        .update(updateData);

      updatedUser = await db.orm.public.User
        .where({ id: userId })
        .first();
    }

    return res.json({
      user: formatUserManagement(updatedUser),
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      message: 'Error updating user',
      error: error.message,
    });
  }
};
