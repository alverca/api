"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 売上レポートルーター
 */
const alverca = require("@alverca/domain");
const createDebug = require("debug");
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const fastCsv = require("fast-csv");
const iconv = require("iconv-lite");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const debug = createDebug('@alverca/api:router');
// カラム区切り(タブ)
const CSV_DELIMITER = '\t';
// 改行コード(CR+LF)
const CSV_LINE_ENDING = '\r\n';
const aggregateSalesRouter = express_1.Router();
/**
 * 検索
 */
aggregateSalesRouter.get('', permitScopes_1.default(['admin']), ...[
    express_validator_1.query('limit')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('page')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$exists')
        .optional()
        .isBoolean()
        .toBoolean(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$lt')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (typeof ((_a = req.query) === null || _a === void 0 ? void 0 : _a.limit) === 'number') ? Math.min(req.query.limit, 100) : 100;
        const page = (typeof ((_b = req.query) === null || _b === void 0 ? void 0 : _b.page) === 'number') ? Math.max(req.query.page, 1) : 1;
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        const andConditions = [
            { 'project.id': { $exists: true, $eq: (_c = req.project) === null || _c === void 0 ? void 0 : _c.id } }
        ];
        const $and = (_d = req.query) === null || _d === void 0 ? void 0 : _d.$and;
        if (Array.isArray($and)) {
            andConditions.push(...$and);
        }
        const reports = yield reportRepo.aggregateSaleModel.find((Array.isArray(andConditions) && andConditions.length > 0) ? { $and: andConditions } : {})
            .sort({ sortBy: 1 })
            .limit(limit)
            .skip(limit * (page - 1))
            .setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
        res.json(reports);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * ストリーミング検索
 */
aggregateSalesRouter.get('/stream', permitScopes_1.default(['admin']), ...[
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$exists')
        .optional()
        .isBoolean()
        .toBoolean(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$lt')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, 
// tslint:disable-next-line:max-func-body-length
(req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _e, _f;
    try {
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        debug('finding aggregateSales...', req.query);
        const andConditions = [
            { 'project.id': { $exists: true, $eq: (_e = req.project) === null || _e === void 0 ? void 0 : _e.id } }
        ];
        const $and = (_f = req.query) === null || _f === void 0 ? void 0 : _f.$and;
        if (Array.isArray($and)) {
            andConditions.push(...$and);
        }
        const cursor = reportRepo.aggregateSaleModel.find((Array.isArray(andConditions) && andConditions.length > 0) ? { $and: andConditions } : {})
            .sort({ sortBy: 1 })
            .cursor();
        // Mongoドキュメントをcsvデータに変換するtransformer
        const transformer = (doc) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12;
            const eventDate = moment(doc.reservation.reservationFor.startDate)
                .toDate();
            const dateRecorded = (moment(doc.dateRecorded)
                .isAfter(moment(eventDate)
                .add(1, 'hour')))
                ? moment(doc.dateRecorded)
                    // tslint:disable-next-line:no-magic-numbers
                    .add(-9, 'hours')
                    .tz('Asia/Tokyo')
                    .format('YYYY/MM/DD HH:mm:ss')
                : moment(doc.dateRecorded)
                    .tz('Asia/Tokyo')
                    .format('YYYY/MM/DD HH:mm:ss');
            const dateUsed = (_a = doc.reservation.reservedTicket) === null || _a === void 0 ? void 0 : _a.dateUsed;
            const attended = dateUsed !== undefined && dateUsed !== null;
            const attendDate = (attended)
                ? (moment(dateUsed)
                    .isBefore(moment(eventDate)
                    // tslint:disable-next-line:no-magic-numbers
                    .add(-3, 'hour')))
                    ? moment(dateUsed)
                        // tslint:disable-next-line:no-magic-numbers
                        .add(9, 'hours')
                        .tz('Asia/Tokyo')
                        .format('YYYY/MM/DD HH:mm:ss')
                    : moment(dateUsed)
                        .tz('Asia/Tokyo')
                        .format('YYYY/MM/DD HH:mm:ss')
                : '';
            let seatNumber = (_d = (_c = (_b = doc.reservation) === null || _b === void 0 ? void 0 : _b.reservedTicket) === null || _c === void 0 ? void 0 : _c.ticketedSeat) === null || _d === void 0 ? void 0 : _d.seatNumber;
            let ticketTypeName = (_h = (_g = (_f = (_e = doc.reservation) === null || _e === void 0 ? void 0 : _e.reservedTicket) === null || _f === void 0 ? void 0 : _f.ticketType) === null || _g === void 0 ? void 0 : _g.name) === null || _h === void 0 ? void 0 : _h.ja;
            let csvCode = (_l = (_k = (_j = doc.reservation) === null || _j === void 0 ? void 0 : _j.reservedTicket) === null || _k === void 0 ? void 0 : _k.ticketType) === null || _l === void 0 ? void 0 : _l.csvCode;
            let unitPrice = (typeof ((_q = (_p = (_o = (_m = doc.reservation) === null || _m === void 0 ? void 0 : _m.reservedTicket) === null || _o === void 0 ? void 0 : _o.ticketType) === null || _p === void 0 ? void 0 : _p.priceSpecification) === null || _q === void 0 ? void 0 : _q.price) === 'number')
                ? String((_u = (_t = (_s = (_r = doc.reservation) === null || _r === void 0 ? void 0 : _r.reservedTicket) === null || _s === void 0 ? void 0 : _s.ticketType) === null || _t === void 0 ? void 0 : _t.priceSpecification) === null || _u === void 0 ? void 0 : _u.price)
                : '';
            let paymentSeatIndex = (typeof doc.payment_seat_index === 'string' || typeof doc.payment_seat_index === 'number')
                ? String(doc.payment_seat_index)
                : '';
            // 返品手数料の場合、値を調整
            if (doc.category === alverca.factory.report.order.ReportCategory.CancellationFee) {
                seatNumber = '';
                ticketTypeName = '';
                csvCode = '';
                unitPrice = String(doc.amount);
                paymentSeatIndex = '';
            }
            // Return an object with all fields you need in the CSV
            return {
                購入番号: String((_v = doc.mainEntity) === null || _v === void 0 ? void 0 : _v.confirmationNumber),
                パフォーマンスID: (_x = (_w = doc.reservation) === null || _w === void 0 ? void 0 : _w.reservationFor) === null || _x === void 0 ? void 0 : _x.id,
                座席コード: seatNumber,
                予約ステータス: doc.category,
                入塔予約年月日: moment(doc.reservation.reservationFor.startDate)
                    .tz('Asia/Tokyo')
                    .format('YYYYMMDD'),
                入塔予約時刻: moment(doc.reservation.reservationFor.startDate)
                    .tz('Asia/Tokyo')
                    .format('HHmm'),
                '---a': '',
                '---b': '',
                '---c': '',
                '---d': '',
                '---e': '',
                購入者区分: (_z = (_y = doc.mainEntity) === null || _y === void 0 ? void 0 : _y.customer) === null || _z === void 0 ? void 0 : _z.group,
                '購入者（名）': (_1 = (_0 = doc.mainEntity) === null || _0 === void 0 ? void 0 : _0.customer) === null || _1 === void 0 ? void 0 : _1.givenName,
                '購入者（姓）': (_3 = (_2 = doc.mainEntity) === null || _2 === void 0 ? void 0 : _2.customer) === null || _3 === void 0 ? void 0 : _3.familyName,
                購入者メール: (_5 = (_4 = doc.mainEntity) === null || _4 === void 0 ? void 0 : _4.customer) === null || _5 === void 0 ? void 0 : _5.email,
                購入者電話: (_7 = (_6 = doc.mainEntity) === null || _6 === void 0 ? void 0 : _6.customer) === null || _7 === void 0 ? void 0 : _7.telephone,
                購入日時: dateRecorded,
                決済方法: (_8 = doc.mainEntity) === null || _8 === void 0 ? void 0 : _8.paymentMethod,
                '---f': '',
                '---g': '',
                券種名称: ticketTypeName,
                チケットコード: csvCode,
                券種料金: unitPrice,
                客層: (_10 = (_9 = doc.mainEntity) === null || _9 === void 0 ? void 0 : _9.customer) === null || _10 === void 0 ? void 0 : _10.segment,
                payment_seat_index: paymentSeatIndex,
                予約単位料金: String(doc.amount),
                ユーザーネーム: (_12 = (_11 = doc.mainEntity) === null || _11 === void 0 ? void 0 : _11.customer) === null || _12 === void 0 ? void 0 : _12.username,
                入場フラグ: (attended) ? 'TRUE' : 'FALSE',
                入場日時: attendDate
            };
        };
        // Create a Fast CSV stream which transforms documents to objects
        const csvStream = fastCsv
            .createWriteStream({
            headers: true,
            delimiter: CSV_DELIMITER,
            quoteColumns: true,
            rowDelimiter: CSV_LINE_ENDING
            // includeEndRowDelimiter: true
            // quote: '"',
            // escape: '"'
        })
            .transform(transformer);
        // sjisに変換して流し込む
        cursor.pipe(csvStream)
            .pipe(iconv.decodeStream('utf-8'))
            .pipe(iconv.encodeStream('windows-31j'))
            .pipe(res);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = aggregateSalesRouter;
