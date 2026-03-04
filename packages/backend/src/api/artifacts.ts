import { Router, type Router as RouterType } from 'express';
import { getArtifactsForCase, deleteArtifact } from '../services/artifact-service.js';

export const artifactsRouter: RouterType = Router();

// List artifacts for a case
artifactsRouter.get('/', (req, res) => {
  try {
    const caseId = req.query.case_id as string;
    if (!caseId) {
      return res.status(400).json({ error: { code: 'MISSING_CASE_ID', message: 'case_id query parameter is required' } });
    }

    const artifacts = getArtifactsForCase(caseId);
    res.json({ data: artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});

// Delete an artifact
artifactsRouter.delete('/:id', async (req, res) => {
  try {
    await deleteArtifact(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
  }
});
