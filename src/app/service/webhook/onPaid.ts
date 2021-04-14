/**
 * 決済イベント受信サービス
 */
import * as chevre from '@chevre/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';

import { createOrderReport } from '../report/order';

export function onPaid(params: chevre.factory.action.trade.pay.IAction) {
    return async (repos: {
        accountingReport: chevre.repository.AccountingReport;
        order: chevre.repository.Order;
        report: chevre.repository.Report;
    }): Promise<void> => {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case chevre.factory.actionType.ReturnAction:
                await onReturnFeePaid(params)(repos);
                break;

            // 注文決済であれば
            case cinerinoapi.factory.order.OrderType.Order:
                await onOrderPaid(params)(repos);
                break;

            default:
        }
    };
}

function onReturnFeePaid(params: chevre.factory.action.trade.pay.IAction) {
    return async (repos: {
        accountingReport: chevre.repository.AccountingReport;
        order: chevre.repository.Order;
        report: chevre.repository.Report;
    }): Promise<void> => {
        const orderNumber = (<any>params).purpose?.object?.orderNumber;

        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.object.orderNumber not string');
        }

        // 注文番号で注文決済行を取得
        const reservedReport = await repos.report.aggregateSaleModel.findOne({
            category: chevre.factory.report.order.ReportCategory.Reserved,
            'mainEntity.orderNumber': {
                $exists: true,
                $eq: orderNumber
            }
        })
            .exec()
            .then((doc) => {
                if (doc === null) {
                    throw new Error('Reserved report not found');
                }

                return <chevre.factory.report.order.IReport>doc.toObject();
            });

        // 返品手数料行を作成
        // category amount dateRecorded sortBy paymentSeatIndexを変更すればよい
        let amount = 0;
        if (typeof params.object[0].paymentMethod.totalPaymentDue?.value === 'number') {
            amount = params.object[0].paymentMethod.totalPaymentDue.value;
        }
        const sortBy = reservedReport.sortBy.replace(':00:', ':02:');
        const dateRecorded: Date = moment(params.startDate)
            .toDate();
        const report: chevre.factory.report.order.IReport = {
            ...reservedReport,
            amount,
            category: chevre.factory.report.order.ReportCategory.CancellationFee,
            dateRecorded,
            sortBy
        };
        if (typeof report.payment_seat_index === 'number') {
            delete report.payment_seat_index;
        }
        delete (<any>report)._id;
        delete (<any>report).id;

        await repos.report.saveReport(report);

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

function onOrderPaid(params: chevre.factory.action.trade.pay.IAction) {
    return async (repos: {
        accountingReport: chevre.repository.AccountingReport;
        order: chevre.repository.Order;
        report: chevre.repository.Report;
    }): Promise<void> => {
        // 注文を取得して、売上レポートに連携
        const orderNumber = (<chevre.factory.action.trade.pay.IOrderAsPayPurpose>params.purpose)?.orderNumber;
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
                orderStatus: cinerinoapi.factory.orderStatus.OrderProcessing
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
