/**
 * リクエストプロジェクト設定ルーター
 */
import * as alverca from '@chevre/domain';
import * as express from 'express';

const setProject = express.Router();

// プロジェクト指定ルーティング配下については、req.projectをセット
setProject.use(
    '/projects/:id',
    async (req, _, next) => {
        req.project = { typeOf: alverca.factory.organizationType.Project, id: req.params.id };

        next();
    }
);

export default setProject;
