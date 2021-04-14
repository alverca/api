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
const alverca = require("@chevre/domain");
const middlewares = require("@motionpicture/express-middleware");
const ioredis = require("ioredis");
const UNIT_IN_SECONDS = (process.env.RATE_LIMIT_UNIT_IN_SECONDS !== undefined) ? Number(process.env.RATE_LIMIT_UNIT_IN_SECONDS) : 1;
// tslint:disable-next-line:no-magic-numbers
const THRESHOLD = (process.env.RATE_LIMIT_THRESHOLD !== undefined) ? Number(process.env.RATE_LIMIT_THRESHOLD) : 10;
const redisClient = new ioredis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_KEY,
    tls: (process.env.REDIS_TLS_SERVERNAME !== undefined) ? { servername: process.env.REDIS_TLS_SERVERNAME } : undefined
});
exports.default = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const routeIdentifier = `${req.baseUrl}${req.path}`;
        const rateLimitScope = (typeof ((_a = req.project) === null || _a === void 0 ? void 0 : _a.id) === 'string')
            ? `alverca-api:${req.project.id}:rateLimit:${routeIdentifier}:${req.method}`
            : `alverca-api:rateLimit:${routeIdentifier}:${req.method}`;
        yield middlewares.rateLimit({
            redisClient: redisClient,
            aggregationUnitInSeconds: UNIT_IN_SECONDS,
            threshold: THRESHOLD,
            // 制限超過時の動作をカスタマイズ
            limitExceededHandler: (_, __, resOnLimitExceeded, nextOnLimitExceeded) => {
                resOnLimitExceeded.setHeader('Retry-After', UNIT_IN_SECONDS);
                const message = `Retry after ${UNIT_IN_SECONDS} seconds`;
                nextOnLimitExceeded(new alverca.factory.errors.RateLimitExceeded(message));
            },
            // スコープ生成ロジックをカスタマイズ
            scopeGenerator: () => rateLimitScope
        })(req, res, next);
    }
    catch (error) {
        next(error);
    }
});
