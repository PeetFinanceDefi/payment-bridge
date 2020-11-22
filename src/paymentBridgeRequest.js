import { Sequelize, DataTypes, Model } from "sequelize";

export class PaymentBridgeRequest extends Model { }

export const init = (sequelize) => {
    PaymentBridgeRequest.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            field: "id_request"
        },
        state: {
            type: DataTypes.INTEGER,
            field: "state"
        },
        txId: {
            type: DataTypes.STRING,
            field: "tx_id",
            allowNull: true
        },
        salt: {
            type: DataTypes.STRING,
            field: "salt",
            allowNull: true
        },
        transfertAddr: {
            type: DataTypes.STRING,
            field: "transfert_addr",
            allowNull: true
        },
        fromAddr: {
            type: DataTypes.STRING,
            field: "from_addr",
            allowNull: true
        },
        dstAddr: {
            type: DataTypes.STRING,
            field: "dst_addr",
            allowNull: true
        },
        pteTx: {
            type: DataTypes.STRING,
            field: "pte_tx",
            allowNull: true
        },
        ethTx: {
            type: DataTypes.STRING,
            field: "eth_tx",
            allowNull: true
        },
        amountEth: {
            type: DataTypes.DOUBLE,
            field: "amount_eth",
            allowNull: true
        },
        amountPte: {
            type: DataTypes.DOUBLE,
            field: "amount_pte",
            allowNull: true
        },
        gasPrice: {
            type: DataTypes.DOUBLE,
            field: "gas_price",
            allowNull: true
        },
        createdAt: {
            type: DataTypes.DATE, 
            defaultValue: DataTypes.NOW,
            field: "created_at",
            allowNull: true
        },
        expiredAt: {
            type: DataTypes.DATE, 
            field: "expire_at",
            allowNull: true
        },
        receivedAt: {
            type: DataTypes.DATE, 
            field: "received_at",
            allowNull: true
        },
    }, {
        sequelize,
        timestamps: false,
        modelName: 'PaymentBridgeRequest',
        tableName: 'payment_bridge_request'
    })
}