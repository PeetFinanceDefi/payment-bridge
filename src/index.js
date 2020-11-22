require('dotenv').config();
import Web3 from "web3";
import * as DB from "./db";
import TransactionWatcher from "./transactionWatcher";
import * as API from "./api";

let web3 = new Web3(process.env.WEB3_PROVIDER);
let wallet = web3.eth.accounts.privateKeyToAccount(process.env.PEET_PAY_WALLET_PRIVATE_KEY);
let watcher = null;

(async() => {
    await DB.connect();
    watcher = new TransactionWatcher(web3, wallet);
    watcher.watchPrice();
    watcher.replayPendingTx();
    watcher.watch();
    //watcher.checkPreviousBlocks(20);
    API.start();
})()

export const getWeb3Driver = () => web3;
export const getWatcher = () => watcher;
export const getBonusRanges = () => {
    return [
        { from: 0, to: 50, percent: 5},
        { from: 50, to: 100, percent: 4},
        { from: 100, to: 200, percent: 3}
    ]
};