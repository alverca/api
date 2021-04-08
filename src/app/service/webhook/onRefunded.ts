/**
 * 返金イベント受信サービス
 */
import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';

import { createOrderReport } from '../report/order';

export function onRefunded(params: alverca.factory.chevre.action.trade.refund.IAction) {
    return async (repos: {
        accountingReport: alverca.repository.AccountingReport;
        order: alverca.repository.Order;
        report: alverca.repository.Report;
    }): Promise<void> => {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case alverca.factory.chevre.actionType.ReturnAction:
                await onOrderRefunded(params)(repos);
                break;

            default:
        }
    };
}

function onOrderRefunded(params: alverca.factory.chevre.action.trade.refund.IAction) {
    return async (repos: {
        accountingReport: alverca.repository.AccountingReport;
        order: alverca.repository.Order;
        report: alverca.repository.Report;
    }): Promise<void> => {
        // 注文を取得して、売上レポートに連携
        const orderNumber = (<any>params).purpose?.object?.orderNumber;
        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.orderNumber not string');
        }

        const order = await repos.order.orderModel.findOne({ orderNumber })
            .exec()
            .then((doc) => {
                if (doc === null) {
                    throw new Error('Order not found');

                }

                return doc.toObject();
            });

        // 注文から売上レポート作成
        await createOrderReport({
            order: {
                ...order,
                orderStatus: cinerinoapi.factory.orderStatus.OrderReturned,
                dateReturned: moment(params.startDate)
                    .toDate()
            }
        })(repos);

        // 注文に決済アクションを追加
        const action4save = {
            ...params,
            startDate: moment(params.startDate)
                .toDate(),
            ...(params.endDate !== undefined)
                ? {
                    endDate: moment(params.startDate)
                        .toDate()
                }
                : undefined
        };
        const childReport = { typeOf: 'Report', mainEntity: action4save };
        await repos.accountingReport.accountingReportModel.findOneAndUpdate(
            { 'mainEntity.orderNumber': orderNumber },
            { $addToSet: <any>{ hasPart: childReport } }
        )
            .exec();
    };
}
