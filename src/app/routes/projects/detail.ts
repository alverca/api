/**
 * プロジェクト詳細ルーター
 */
import * as alverca from '@alverca/domain';
import * as express from 'express';

import aggregateSalesRouter from '../aggregateSales';

const projectDetailRouter = express.Router();

projectDetailRouter.use((req, _, next) => {
    // プロジェクト未指定は拒否
    if (typeof req.project?.id !== 'string') {
        next(new alverca.factory.errors.Forbidden('project not specified'));

        return;
    }

    next();
});

projectDetailRouter.use('/aggregateSales', aggregateSalesRouter);

export default projectDetailRouter;
