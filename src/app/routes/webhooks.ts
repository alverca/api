/**
 * ウェブフックルーター
 */
import * as chevre from '@chevre/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as express from 'express';
import * as mongoose from 'mongoose';

const webhooksRouter = express.Router();

import { NO_CONTENT } from 'http-status';

/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post(
    '/onOrderStatusChanged',
    async (req, res, next) => {
        try {
            const order = <cinerinoapi.factory.order.IOrder>req.body.data;

            const accountingReportRepo = new chevre.repository.AccountingReport(mongoose.connection);
            const orderRepo = new chevre.repository.Order(mongoose.connection);

            if (typeof order?.orderNumber === 'string') {
                await chevre.service.webhook.onOrderStatusChanged(order)({ accountingReport: accountingReportRepo, order: orderRepo });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

/**
 * 予約使用アクション変更イベント
 */
webhooksRouter.post(
    '/onActionStatusChanged',
    async (req, res, next) => {
        try {
            const action
                // tslint:disable-next-line:max-line-length
                = <chevre.factory.action.IAction<chevre.factory.action.IAttributes<chevre.factory.actionType, any, any>> | undefined>
                req.body.data;

            const reportRepo = new chevre.repository.Report(mongoose.connection);

            if (typeof action?.typeOf === 'string') {
                await chevre.service.webhook.onActionStatusChanged(action)({ report: reportRepo });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

/**
 * 決済アクション受信
 */
webhooksRouter.post(
    '/onPaymentStatusChanged',
    async (req, res, next) => {
        try {
            const action
                // tslint:disable-next-line:max-line-length
                = <chevre.factory.action.IAction<chevre.factory.action.IAttributes<chevre.factory.actionType, any, any>> | undefined>
                req.body.data;

            const accountingReportRepo = new chevre.repository.AccountingReport(mongoose.connection);
            // const actionRepo = new chevre.repository.Action(mongoose.connection);
            const orderRepo = new chevre.repository.Order(mongoose.connection);
            const reportRepo = new chevre.repository.Report(mongoose.connection);

            if (typeof action?.id === 'string' && typeof action?.typeOf === 'string') {
                // とりあえずアクション保管
                // await actionRepo.actionModel.findByIdAndUpdate(
                //     action.id,
                //     { $setOnInsert: action },
                //     { upsert: true }
                // )
                //     .exec();

                await chevre.service.webhook.onPaymentStatusChanged(action)({
                    accountingReport: accountingReportRepo,
                    order: orderRepo,
                    report: reportRepo
                });
            }

            res.status(NO_CONTENT)
                .end();
        } catch (error) {
            next(error);
        }
    }
);

export default webhooksRouter;
