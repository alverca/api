/**
 * プロジェクト詳細ルーター
 */
import * as alverca from '@alverca/domain';
import * as express from 'express';

import accountingReportsRouter from '../accountingReports';
import aggregateSalesRouter from '../aggregateSales';
import paymentReportsRouter from '../paymentReports';

const projectDetailRouter = express.Router();

projectDetailRouter.use((req, _, next) => {
    // プロジェクト未指定は拒否
    if (typeof req.project?.id !== 'string') {
        next(new alverca.factory.errors.Forbidden('project not specified'));

        return;
    }

    next();
});

projectDetailRouter.use('/accountingReports', accountingReportsRouter);
projectDetailRouter.use('/aggregateSales', aggregateSalesRouter);
projectDetailRouter.use('/paymentReports', paymentReportsRouter);

export default projectDetailRouter;
