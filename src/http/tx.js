import Router from "koa-router";
import * as DB from "../db";
import uniqid from "uniqid";
import sha1 from "sha1";
import moment from 'moment';
import { getWatcher, getWeb3Driver } from "../index";

const router = Router({
    prefix: "/api/v1/tx"
})

router.post("/", async (ctx, next) => {
    if (!getWeb3Driver().utils.isAddress(ctx.request.body.fromAddr) || !getWeb3Driver().utils.isAddress(ctx.request.body.transfertAddr)) {
        ctx.response.status = 400;
        return ctx.body = "Invalid address";
    }
    const alreadyPendingTx = await DB.getModels().PaymentBridgeRequest.findOne({
        where: {
            fromAddr: ctx.request.body.fromAddr,
            state: 1
        }
    })
    if (alreadyPendingTx != null) {
        if (moment.utc() < moment(alreadyPendingTx.expiredAt)) {
            return ctx.body = {
                tx_id: alreadyPendingTx.txId,
                from_addr: alreadyPendingTx.fromAddr,
                transfert_addr: alreadyPendingTx.transfertAddr,
                dst_addr: alreadyPendingTx.dstAddr,
                expire_in: parseInt(moment.duration(moment(alreadyPendingTx.expiredAt).diff(moment.utc())).asSeconds().toFixed(0))
            }
        }
        else {
            alreadyPendingTx.state = 4;
            await alreadyPendingTx.save();
        }
    }

    const salt = uniqid();
    const record = await DB.getModels().PaymentBridgeRequest.create({
        txId: sha1(salt + process.env.SECRET_SALT + Math.floor(new Date().getTime() / 1000).toString()),
        salt: salt,
        dstAddr: process.env.PEET_PAY_WALLET_ADDR,
        fromAddr: ctx.request.body.fromAddr,
        transfertAddr: ctx.request.body.transfertAddr,
        expiredAt: moment.utc().add(parseInt(process.env.EXPIRATION_TX_MINUTE), "minutes").toDate(),
        state: 1
    })

    return ctx.body = {
        tx_id: record.txId,
        from_addr: record.fromAddr,
        transfert_addr: record.transfertAddr,
        dst_addr: record.dstAddr,
        expire_in: parseInt(moment.duration(moment(record.expiredAt).diff(moment.utc())).asSeconds().toFixed(0))
    }
})

router.get("/price", async (ctx, next) => {
    const price = getWatcher().currentPteEthPrice;
    const givenPte = await getWatcher().getTotalPTEGiven();
    const currentBonus = await getWatcher().getCurrentBonusRange();
    return ctx.body = { price, given_pte: givenPte, current_bonus: currentBonus };
});

router.get("/watch/:id", async (ctx, next) => {
    const tx = await DB.getModels().PaymentBridgeRequest.findOne({
        where: {
            tx_id: ctx.params.id,
        }
    })
    if(tx == null) {
        ctx.response.status = 404;
        return;
    }

    return ctx.body = { 
        state: tx.state,
        amount_pte: tx.amountPte,
        tx_id: tx.txId,
        pte_tx: tx.pteTx,
        send_addr: tx.dstAddr,
        chain: process.env.CHAIN
    };
});

export default router;