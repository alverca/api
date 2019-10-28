"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 注文取引ルーター(POS専用)
 */
const cinerinoapi = require("@cinerino/api-nodejs-client");
const ttts = require("@tokyotower/domain");
const express_1 = require("express");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const request = require("request-promise-native");
const auth = new cinerinoapi.auth.ClientCredentials({
    domain: '',
    clientId: '',
    clientSecret: '',
    scopes: [],
    state: ''
});
const placeOrderTransactionsRouter = express_1.Router();
const authentication_1 = require("../../middlewares/authentication");
const permitScopes_1 = require("../../middlewares/permitScopes");
const validator_1 = require("../../middlewares/validator");
const TRANSACTION_AMOUNT_TTL = 3600;
const TRANSACTION_AMOUNT_KEY_PREFIX = 'placeOrderTransactionAmount.';
const redisClient = ttts.redis.createClient({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
placeOrderTransactionsRouter.use(authentication_1.default);
placeOrderTransactionsRouter.post('/start', permitScopes_1.default(['pos', 'transactions']), (req, _, next) => {
    req.checkBody('expires', 'invalid expires')
        .notEmpty()
        .withMessage('expires is required')
        .isISO8601();
    next();
}, validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const sellerIdentifier = 'TokyoTower';
        // WAITER許可証を取得
        const scope = 'placeOrderTransaction.TokyoTower.POS';
        const { token } = yield request.post(`${process.env.WAITER_ENDPOINT}/projects/${process.env.PROJECT_ID}/passports`, {
            json: true,
            body: { scope: scope }
        })
            .then((body) => body);
        const expires = moment(req.body.expires)
            .toDate();
        auth.setCredentials({ access_token: req.accessToken });
        const placeOrderService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        const transaction = yield placeOrderService.start({
            expires: expires,
            sellerIdentifier: sellerIdentifier,
            passportToken: token
        });
        // tslint:disable-next-line:no-string-literal
        // const host = req.headers['host'];
        // res.setHeader('Location', `https://${host}/transactions/${transaction.id}`);
        res.status(http_status_1.CREATED)
            .json(transaction);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 購入者情報を変更する
 */
placeOrderTransactionsRouter.put('/:transactionId/customerContact', permitScopes_1.default(['pos', 'transactions']), (req, _, next) => {
    req.checkBody('last_name')
        .notEmpty()
        .withMessage('required');
    req.checkBody('first_name')
        .notEmpty()
        .withMessage('required');
    req.checkBody('tel')
        .notEmpty()
        .withMessage('required');
    req.checkBody('email')
        .notEmpty()
        .withMessage('required');
    next();
}, validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        auth.setCredentials({ access_token: req.accessToken });
        const placeOrderService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        const profile = yield placeOrderService.setCustomerContact({
            transactionId: req.params.transactionId,
            contact: Object.assign({}, req.body, { id: req.user.sub, givenName: (typeof req.body.first_name === 'string') ? req.body.first_name : '', familyName: (typeof req.body.last_name === 'string') ? req.body.last_name : '', telephone: (typeof req.body.tel === 'string') ? req.body.tel : '', telephoneRegion: (typeof req.body.address === 'string') ? req.body.address : '' })
        });
        res.status(http_status_1.CREATED)
            .json(Object.assign({}, profile, { 
            // POSへの互換性維持のために値補完
            last_name: profile.familyName, first_name: profile.givenName, tel: profile.telephone }));
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 座席仮予約
 */
placeOrderTransactionsRouter.post('/:transactionId/actions/authorize/seatReservation', permitScopes_1.default(['pos', 'transactions']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        if (!Array.isArray(req.body.offers)) {
            req.body.offers = [];
        }
        const performanceId = req.body.performance_id;
        auth.setCredentials({ access_token: req.accessToken });
        const placeOrderService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        const action = yield placeOrderService.createSeatReservationAuthorization({
            transactionId: req.params.transactionId,
            performanceId: performanceId,
            offers: req.body.offers
        });
        // 金額保管
        if (action.result !== undefined) {
            const key = `${TRANSACTION_AMOUNT_KEY_PREFIX}${req.params.transactionId}`;
            const amount = action.result.price;
            yield new Promise((resolve, reject) => {
                redisClient.multi()
                    .set(key, amount.toString())
                    .expire(key, TRANSACTION_AMOUNT_TTL)
                    .exec((err) => {
                    if (err !== null) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        res.status(http_status_1.CREATED)
            .json(action);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 座席仮予約削除
 */
placeOrderTransactionsRouter.delete('/:transactionId/actions/authorize/seatReservation/:actionId', permitScopes_1.default(['pos', 'transactions']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        auth.setCredentials({ access_token: req.accessToken });
        const placeOrderService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        yield placeOrderService.cancelSeatReservationAuthorization({
            transactionId: req.params.transactionId,
            actionId: req.params.actionId
        });
        // 金額リセット
        const key = `${TRANSACTION_AMOUNT_KEY_PREFIX}${req.params.transactionId}`;
        yield new Promise((resolve, reject) => {
            redisClient.multi()
                .set(key, '0')
                .expire(key, TRANSACTION_AMOUNT_TTL)
                .exec((err) => {
                if (err !== null) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
placeOrderTransactionsRouter.post('/:transactionId/confirm', permitScopes_1.default(['pos', 'transactions']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const paymentMethodType = req.body.payment_method;
        // クライアントがPOSの場合、決済方法承認アクションを自動生成
        let authorizingPaymentMethodType;
        switch (paymentMethodType) {
            case cinerinoapi.factory.paymentMethodType.Cash:
            case cinerinoapi.factory.paymentMethodType.CreditCard:
                authorizingPaymentMethodType = paymentMethodType;
                break;
            default:
                // その他の決済方法を認められるのは代理予約だけ
                throw new ttts.factory.errors.Argument('paymentMethod', `Invalid payment method for the client`);
        }
        auth.setCredentials({ access_token: req.accessToken });
        const paymentService = new cinerinoapi.service.Payment({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        // 金額取得
        const key = `${TRANSACTION_AMOUNT_KEY_PREFIX}${req.params.transactionId}`;
        const amount = yield new Promise((resolve, reject) => {
            redisClient.get(key, (err, result) => {
                if (err !== null) {
                    reject(err);
                }
                else {
                    resolve(Number(result));
                }
            });
        });
        yield paymentService.authorizeAnyPayment({
            object: {
                typeOf: authorizingPaymentMethodType,
                name: paymentMethodType,
                additionalProperty: [],
                amount: amount
            },
            purpose: { typeOf: cinerinoapi.factory.transactionType.PlaceOrder, id: req.params.transactionId }
        });
        const informOrderUrl = `${req.protocol}://${req.hostname}/webhooks/onPlaceOrder`;
        // const informReservationUrl = `${req.protocol}://${req.hostname}/webhooks/onReservationConfirmed`;
        const placeOrderService = new cinerinoapi.service.transaction.PlaceOrder4ttts({
            auth: auth,
            endpoint: process.env.CINERINO_API_ENDPOINT
        });
        const transactionResult = yield placeOrderService.confirm({
            transactionId: req.params.transactionId,
            paymentMethod: paymentMethodType,
            informOrderUrl: informOrderUrl
            // informReservationUrl: informReservationUrl
        });
        res.status(http_status_1.CREATED)
            .json(Object.assign({}, transactionResult, { 
            // POSへ互換性維持のためにeventReservations属性を生成
            eventReservations: (transactionResult !== undefined)
                ? transactionResult.order.acceptedOffers
                    .map((o) => {
                    const r = o.itemOffered;
                    return {
                        qr_str: r.id,
                        // tslint:disable-next-line:no-magic-numbers
                        payment_no: transactionResult.order.confirmationNumber.slice(-6),
                        performance: r.reservationFor.id
                    };
                })
                : [] }));
    }
    catch (error) {
        next(error);
    }
}));
exports.default = placeOrderTransactionsRouter;
