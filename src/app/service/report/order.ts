/**
 * 売上レポートサービス
 */
import * as alverca from '@alverca/domain';
import * as cinerinoapi from '@cinerino/sdk';
import * as moment from 'moment-timezone';
import * as util from 'util';

export import PriceSpecificationType = cinerinoapi.factory.chevre.priceSpecificationType;
export type ICompoundPriceSpecification = alverca.factory.chevre.compoundPriceSpecification.IPriceSpecification<PriceSpecificationType>;

/**
 * 注文アイテムから単価を取得する
 */
function getUnitPriceByAcceptedOffer(offer: cinerinoapi.factory.order.IAcceptedOffer<any>) {
    let unitPrice: number = 0;

    const priceSpecType = offer.priceSpecification?.typeOf;
    if (priceSpecType === PriceSpecificationType.CompoundPriceSpecification) {
        const priceSpecification = <ICompoundPriceSpecification>offer.priceSpecification;
        const unitPriceSpec = priceSpecification.priceComponent?.find((c) => c.typeOf === PriceSpecificationType.UnitPriceSpecification);
        if (typeof unitPriceSpec?.price === 'number') {
            unitPrice = unitPriceSpec.price;
        }
    }

    return unitPrice;
}

function getSortBy(order: cinerinoapi.factory.order.IOrder, orderItem: cinerinoapi.factory.order.IItemOffered, status: string) {
    let sortBy: string = util.format(
        '%s:%s:%s',
        `00000000000000000000${moment(order.orderDate)
            .unix()}`
            // tslint:disable-next-line:no-magic-numbers
            .slice(-20),
        `00000000000000000000${order.confirmationNumber}`
            // tslint:disable-next-line:no-magic-numbers
            .slice(-20),
        status
    );

    if (orderItem.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
        const seatNumber = (<cinerinoapi.factory.order.IReservation>orderItem).reservedTicket.ticketedSeat?.seatNumber;

        sortBy = util.format(
            '%s:%s:%s:%s',
            `00000000000000000000${moment((<cinerinoapi.factory.order.IReservation>orderItem).reservationFor.startDate)
                .unix()}`
                // tslint:disable-next-line:no-magic-numbers
                .slice(-20),
            `00000000000000000000${order.confirmationNumber}`
                // tslint:disable-next-line:no-magic-numbers
                .slice(-20),
            status,
            (typeof seatNumber === 'string') ? seatNumber : (<cinerinoapi.factory.order.IReservation>orderItem).id
        );

    }

    return sortBy;
}

/**
 * 注文からレポートを作成する
 */
export function createOrderReport(params: {
    order: cinerinoapi.factory.order.IOrder;
}) {
    return async (repos: { report: alverca.repository.Report }): Promise<void> => {
        let datas: alverca.factory.report.order.IReport[] = [];

        switch (params.order.orderStatus) {
            case cinerinoapi.factory.orderStatus.OrderProcessing:
                datas = params.order.acceptedOffers
                    .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation)
                    .map((o, index) => {
                        const unitPrice = getUnitPriceByAcceptedOffer(o);

                        return reservation2report({
                            category: alverca.factory.report.order.ReportCategory.Reserved,
                            r: o.itemOffered,
                            unitPrice: unitPrice,
                            order: params.order,
                            paymentSeatIndex: index,
                            salesDate: moment(params.order.orderDate)
                                .toDate()
                        });
                    });

                break;

            case cinerinoapi.factory.orderStatus.OrderDelivered:
                break;

            case cinerinoapi.factory.orderStatus.OrderReturned:
                datas = params.order.acceptedOffers
                    .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation)
                    .map((o, index) => {
                        const unitPrice = getUnitPriceByAcceptedOffer(o);

                        return reservation2report({
                            category: alverca.factory.report.order.ReportCategory.Cancelled,
                            r: o.itemOffered,
                            unitPrice: unitPrice,
                            order: params.order,
                            paymentSeatIndex: index,
                            salesDate: moment(<Date>params.order.dateReturned)
                                .toDate()
                        });
                    });
                break;

            default:
        }

        // 冪等性の確保!
        await Promise.all(datas.map(async (data) => {
            await repos.report.saveReport(data);
        }));
    };
}

/**
 * 返金された注文からレポートを作成する
 */
export function createRefundOrderReport(params: {
    order: cinerinoapi.factory.order.IOrder;
}) {
    return async (repos: { report: alverca.repository.Report }): Promise<void> => {
        const datas: alverca.factory.report.order.IReport[] = [];
        const acceptedOffers = params.order.acceptedOffers
            .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation);
        if (acceptedOffers.length > 0) {
            const acceptedOffer = acceptedOffers[0];
            const unitPrice = getUnitPriceByAcceptedOffer(acceptedOffer);

            datas.push({
                ...reservation2report({
                    category: alverca.factory.report.order.ReportCategory.CancellationFee,
                    r: acceptedOffer.itemOffered,
                    unitPrice: unitPrice,
                    order: params.order,
                    // 返品手数料行にはpayment_seat_indexなし
                    paymentSeatIndex: undefined,
                    salesDate: moment(<Date>params.order.dateReturned)
                        .toDate()
                })
            });
        }

        // 冪等性の確保!
        await Promise.all(datas.map(async (data) => {
            await repos.report.saveReport(data);
        }));
    };
}

/**
 * 予約データをcsvデータ型に変換する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function reservation2report(params: {
    category: alverca.factory.report.order.ReportCategory;
    r: cinerinoapi.factory.order.IItemOffered;
    unitPrice: number;
    order: cinerinoapi.factory.order.IOrder;
    paymentSeatIndex?: number;
    salesDate: Date;
}): alverca.factory.report.order.IReport {
    const order = params.order;

    const age = (typeof order.customer.age === 'string') ? order.customer.age : '';

    let username = '';
    if (typeof order.customer.memberOf?.membershipNumber === 'string') {
        username = order.customer.memberOf.membershipNumber;
    }
    // order.brokerを参照するように変更
    if (Array.isArray(order.broker?.identifier)) {
        const usernameByBroker = order.broker?.identifier.find((p) => p.name === 'username')?.value;
        if (typeof usernameByBroker === 'string') {
            username = usernameByBroker;
        }
    }

    let paymentMethodName = '';
    // 決済方法区分がOthersの場合のみ、名称を取り込む
    if (Array.isArray(order.paymentMethods) && order.paymentMethods.length > 0) {
        if (order.paymentMethods[0].typeOf === 'Others') {
            paymentMethodName = order.paymentMethods[0].name;
        } else {
            paymentMethodName = order.paymentMethods[0].typeOf;
        }
    }

    const locale = (typeof order.customer.address === 'string') ? order.customer.address : '';
    const gender = (typeof order.customer.gender === 'string') ? order.customer.gender : '';
    const customerSegment = (locale !== '' ? locale : '__') + (age !== '' ? age : '__') + (gender !== '' ? gender : '_');
    const customerGroup: string = order2customerGroup(order);
    let amount: number = Number(order.price);

    const customer: alverca.factory.report.order.ICustomer = {
        group: customerGroup2reportString({ group: customerGroup }),
        givenName: (typeof order.customer.givenName === 'string') ? order.customer.givenName : '',
        familyName: (typeof order.customer.familyName === 'string') ? order.customer.familyName : '',
        email: (typeof order.customer.email === 'string') ? order.customer.email : '',
        telephone: (typeof order.customer.telephone === 'string') ? order.customer.telephone : '',
        segment: customerSegment,
        username: username
    };

    const paymentMethod: string = paymentMethodName2reportString({ name: paymentMethodName });

    const mainEntity: alverca.factory.report.order.IMainEntity = {
        confirmationNumber: order.confirmationNumber,
        customer: customer,
        orderDate: moment(order.orderDate)
            .toDate(),
        orderNumber: order.orderNumber,
        paymentMethod: paymentMethod,
        price: order.price,
        typeOf: order.typeOf
    };

    let csvCode = '';
    let seatNumber: string | undefined;
    let reservation: alverca.factory.report.order.IReservation = {
        id: '',
        reservationFor: {
            id: '',
            startDate: moment(order.orderDate)
                .toDate()
        }
    };

    if (params.r.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
        const reservationByOrder = <cinerinoapi.factory.order.IReservation>params.r;

        // 注文アイテムが予約の場合
        const csvCodeByOrder = reservationByOrder.reservedTicket.ticketType.additionalProperty?.find(
            (p) => p.name === 'csvCode'
        )?.value;
        if (typeof csvCodeByOrder === 'string') {
            csvCode = csvCodeByOrder;
        }

        seatNumber = reservationByOrder.reservedTicket.ticketedSeat?.seatNumber;

        reservation = {
            id: reservationByOrder.id,
            reservationFor: {
                id: reservationByOrder.reservationFor.id,
                startDate: moment(reservationByOrder.reservationFor.startDate)
                    .toDate()
            },
            reservedTicket: {
                ticketType: {
                    csvCode,
                    name: <any>reservationByOrder.reservedTicket.ticketType.name,
                    ...(typeof params.unitPrice === 'number')
                        ? { priceSpecification: { price: params.unitPrice } }
                        : undefined
                },
                ticketedSeat: (typeof seatNumber === 'string') ? { seatNumber } : undefined
            }
        };
    }

    let sortBy: string;
    switch (params.category) {
        case alverca.factory.report.order.ReportCategory.CancellationFee:
            let cancellationFee = 0;
            const returnerIdentifier = params.order.returner?.identifier;
            if (Array.isArray(returnerIdentifier)) {
                const cancellationFeeValue = returnerIdentifier.find((p) => p.name === 'cancellationFee')?.value;
                if (cancellationFeeValue !== undefined) {
                    cancellationFee = Number(cancellationFeeValue);
                }
            }
            amount = cancellationFee;

            sortBy = getSortBy(params.order, params.r, '02');
            break;

        case alverca.factory.report.order.ReportCategory.Cancelled:
            sortBy = getSortBy(params.order, params.r, '01');
            break;

        case alverca.factory.report.order.ReportCategory.Reserved:
            sortBy = getSortBy(params.order, params.r, '00');
            break;

        default:
            throw new Error(`category ${params.category} not implemented`);
    }

    return {
        amount: amount,
        category: params.category,
        dateRecorded: params.salesDate,
        mainEntity: mainEntity,
        project: { typeOf: order.project.typeOf, id: order.project.id },
        reservation: reservation,
        sortBy,
        ...(typeof params.paymentSeatIndex === 'number') ? { payment_seat_index: params.paymentSeatIndex } : undefined
    };
}

function order2customerGroup(params: cinerinoapi.factory.order.IOrder) {
    let customerGroup: string = 'Customer';
    if (Array.isArray(params.customer.identifier)) {
        const customerGroupValue = params.customer.identifier.find((i) => i.name === 'customerGroup')?.value;
        if (typeof customerGroupValue === 'string') {
            customerGroup = customerGroupValue;
        }
    }

    return customerGroup;
}

function paymentMethodName2reportString(params: { name: string }) {
    if (params.name === 'CreditCard') {
        return '0';
    }

    return params.name;
}

function customerGroup2reportString(params: { group: string }) {
    if (params.group === 'Customer') {
        return '01';
    } else if (params.group === 'Staff') {
        return '04';
    }

    return params.group;
}

/**
 * 決済ステータス変更イベント
 */
export function onPaymentStatusChanged(
    params: alverca.factory.chevre.action.IAction<alverca.factory.chevre.action.IAttributes<alverca.factory.chevre.actionType, any, any>>
) {
    return async (repos: { report: alverca.repository.Report }): Promise<void> => {
        switch (params.typeOf) {
            case alverca.factory.chevre.actionType.PayAction:
                await onPaid(<alverca.factory.chevre.action.trade.pay.IAction>params)(repos);
                break;

            case alverca.factory.chevre.actionType.RefundAction:
                await onRefunded(<alverca.factory.chevre.action.trade.refund.IAction>params)(repos);
                break;

            default:
            // no op
        }
    };
}

function onPaid(params: alverca.factory.chevre.action.trade.pay.IAction) {
    return async (repos: { report: alverca.repository.Report }): Promise<void> => {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case alverca.factory.chevre.actionType.ReturnAction:
                await onReturnFeePaid(params)(repos);
                break;

            // 注文決済であれば
            case cinerinoapi.factory.order.OrderType.Order:
                break;

            default:
        }
    };
}

function onRefunded(__: alverca.factory.chevre.action.trade.refund.IAction

) {
    return async (___: { report: alverca.repository.Report }): Promise<void> => {
        // no op
    };
}

function onReturnFeePaid(params: alverca.factory.chevre.action.trade.pay.IAction) {
    return async (repos: { report: alverca.repository.Report }): Promise<void> => {
        const orderNumber = (<any>params).purpose?.object?.orderNumber;

        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.object.orderNumber not string');
        }

        // 注文番号で注文決済行を取得
        const reservedReport = await repos.report.aggregateSaleModel.findOne({
            category: alverca.factory.report.order.ReportCategory.Reserved,
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

                return <alverca.factory.report.order.IReport>doc.toObject();
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
        const report: alverca.factory.report.order.IReport = {
            ...reservedReport,
            amount,
            category: alverca.factory.report.order.ReportCategory.CancellationFee,
            dateRecorded,
            sortBy
        };
        if (typeof report.payment_seat_index === 'number') {
            delete report.payment_seat_index;
        }
        delete (<any>report)._id;
        delete (<any>report).id;

        await repos.report.saveReport(report);
    };
}
