import { Router, type Router as RouterType } from 'express';
import { documentNodeManifests } from '../nodes/document/loader.js';

export const nodesRouter: RouterType = Router();

/**
 * GET /api/nodes/catalog
 * Returns all document node manifests for the Skill Generator and UI.
 */
nodesRouter.get('/catalog', (_req, res) => {
  res.json({ data: documentNodeManifests });
});
