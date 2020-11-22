import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-body";
import cors from "@koa/cors";

import tx from "./http/tx";
import { getWatcher } from "./index";

export const start = async () => {
    const app = new Koa();

    app.use(bodyParser({
        multipart: true,
        urlencoded: true
    }));

    app.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        ctx.set('X-Response-Time', `${ms}ms`);
    });

    app.use(cors());
    app.use(tx.routes()).use(tx.allowedMethods());

    app.listen(process.env.HTTP_PORT);
    console.log("HTTP API listen on *:" + process.env.HTTP_PORT)
}