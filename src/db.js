import { Sequelize } from "sequelize";
import * as PaymentBridgeRequest from "./paymentBridgeRequest";

let conn = null;
let models = {};

export const connect = async() => {
    conn = new Sequelize(process.env.DATABASE_DB, process.env.DATABASE_USERNAME, process.env.DATABASE_PASSWORD, {
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT),
        dialect: "mysql",
        logging: false
    })
    await conn.authenticate();

    PaymentBridgeRequest.init(conn);
    models.PaymentBridgeRequest = PaymentBridgeRequest.PaymentBridgeRequest
}


export const getModels = () => { return models; }