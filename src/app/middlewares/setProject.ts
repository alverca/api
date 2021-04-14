/**
 * リクエストプロジェクト設定ルーター
 */
import * as chevre from '@chevre/domain';
import * as express from 'express';

const setProject = express.Router();

// プロジェクト指定ルーティング配下については、req.projectをセット
setProject.use(
    '/projects/:id',
    async (req, _, next) => {
        req.project = { typeOf: chevre.factory.organizationType.Project, id: req.params.id };

        next();
    }
);

export default setProject;
