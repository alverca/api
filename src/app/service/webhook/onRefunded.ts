/**
 * 返金イベント受信サービス
 */
import * as alverca from '@alverca/domain';
// import * as cinerinoapi from '@cinerino/sdk';
// import * as moment from 'moment-timezone';

export function onRefunded(__: alverca.factory.chevre.action.trade.refund.IAction

) {
    return async (___: { report: alverca.repository.Report }): Promise<void> => {
        // no op
    };
}
