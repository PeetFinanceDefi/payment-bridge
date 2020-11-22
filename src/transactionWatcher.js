import { ChainId, Token, WETH, Fetcher, Route, TokenAmount, TradeType, Trade } from '@uniswap/sdk'
import fs from "fs";
import { Transaction } from "ethereumjs-tx";
import * as DB from "./db";
import moment from 'moment';
import { getBonusRanges } from './index';

export default class TransactionWatcher {
    constructor(web3, wallet) {
        this.web3 = web3;
        this.wallet = wallet;
        this.pendingTxs = [];
        this.confirmedTxs = [];
        this.currentPteEthPrice = 0;
        this.startFlushProcess();
        this.startConfirmedFlushProcess();
    }

    async watchPrice() {
        this.currentPteEthPrice = await this.convertEthPriceToPtePrice(1);
        console.log("Current ETH/PTE price is : " + this.currentPteEthPrice);
        setInterval(async () => {
            this.currentPteEthPrice = await this.convertEthPriceToPtePrice(1);
            console.log("Current ETH/PTE price is : " + this.currentPteEthPrice);
            console.log("We have give " + await this.getTotalPTEGiven() + " PTE");
        }, 60000 * 1)
    }

    watch() {
        this.watchExpiredTx();
        const event = this.web3.eth.subscribe("pendingTransactions", (err, res) => {
            if(err) console.error(err);
        });
        event.on('data', async(txHash) => {
            if(!await this.hasPendingTx()) return;
            this.pendingTxs.push(txHash);
        })
    }

    startFlushProcess() {
        setInterval(async() => {
            if(this.pendingTxs.length == 0) return;
            var batch = new this.web3.BatchRequest();
            console.log("Checking on " + this.pendingTxs.length + " tx");
            for(const txHash of this.pendingTxs) {
                batch.add(this.web3.eth.getTransaction.request(txHash, (err, tx) => {
                    if(tx == null) return;
                    if(tx.to == null) return;
                    if(this.wallet.address.toLowerCase() == tx.to.toLowerCase()) {
                        console.log("Found tx for the wallet hash: " + tx.hash)
                        this.confirmTransaction(tx.hash);
                    }
                }));
            }
            this.pendingTxs = [];
            batch.execute();
        }, 30000)
    }

    startConfirmedFlushProcess() {
        setTimeout(async() => {
            const copy = this.confirmedTxs.slice();
            this.confirmedTxs = [];
            for(const tx of copy) {
                let block = await this.web3.eth.getBlock(tx.blockNumber);
                await this.checkTx(block, tx);
            }
            this.startConfirmedFlushProcess();
        }, 5000)
    }

    async hasPendingTx() {
        const pendingTx = await DB.getModels().PaymentBridgeRequest.findAll({
            where: {
                state: 1
            }
        });
        return pendingTx.length > 0;
    }

    watchExpiredTx() {
        setInterval(async() => {
            const pendingTx = await DB.getModels().PaymentBridgeRequest.findAll({
                where: {
                    state: 1
                }
            });
            for(let tx of pendingTx) {
                if(moment.utc() >= moment(tx.expiredAt)) {
                    tx.state = 4
                    await tx.save();
                    console.log("Expired tx: " + tx.txId);
                }
            }
        }, 1000 * 10)
    }

    async confirmTransaction(txHash) {
        setTimeout(async () => {
            let confirmationCount = await this.getConfirmation(txHash);
            if(confirmationCount < parseInt(process.env.MIN_CONFIRMATION)) {
                return this.confirmTransaction(txHash);
            }
            let tx = await this.web3.eth.getTransaction(txHash);
            this.confirmedTxs.push(tx);
        }, 30000);
    }

    async replayPendingTx() {
        const records = await DB.getModels().PaymentBridgeRequest.findAll({
            where: {
                state: 2
            }
        })
        for(const record of records) {
            await this.sendPTE(record.transfertAddr, record.amountPte, record);
        }
    }

    async getConfirmation(txHash) {
        let tx = await this.web3.eth.getTransaction(txHash);
        const currentBlock = await this.web3.eth.getBlockNumber()
        if(tx == null) return 0;
        return tx.blockNumber === null ? 0 : currentBlock - tx.blockNumber
    }

    async checkPreviousBlocks(blockAmount) {
        let latestBlock = await this.web3.eth.getBlock('latest');
        for(let i = 1; i <= blockAmount; i++) {
            let block = await this.web3.eth.getBlock(latestBlock.number - i);
            if(block != null && block.transactions) await this.checkBlock(block);
        }
    }

    async checkBlock(block) {
        console.log("Check block " + block.number);
        for(let txHash of block.transactions) {
            console.log(txHash)
            let tx = await this.web3.eth.getTransaction(txHash);
            this.checkTx(block, tx);
        }
    }

    async checkTx(block, tx) {
        if(tx.to != null) {
            if(this.wallet.address.toLowerCase() == tx.to.toLowerCase()) {
                await this.transactionOnWallet(block, tx);
            }
        }
    }

    async transactionOnWallet(block, tx) {
        let from = tx.from;
        let amount = this.web3.utils.fromWei(tx.value, 'ether');

        // Create the record for saving the tx in case of bug
        const record = await DB.getModels().PaymentBridgeRequest.findOne({
            where: {
                fromAddr: from,
                state: 1
            }
        })
        if(record == null) {
            console.log("Transaction not found in pending tx");
            return;
        }
        
        record.ethTx = tx.hash;
        record.amountEth = amount;
        record.receivedAt = moment().utc().toDate();
        record.state = 2;
        await record.save();

        console.log("Transaction found on block " + block.number + " from " + from + " for " + amount);
        var pteAmount = await this.addRewardToPTEAmount(await this.convertEthPriceToPtePrice(parseFloat(this.web3.utils.fromWei(tx.value, 'ether'))));

        console.log("We will transfert " + pteAmount + "PTE to " + from);
        await this.sendPTE(record.transfertAddr, pteAmount, record);
    }

    async sendPTE(to, amount, record) {
        const abiArray = JSON.parse(fs.readFileSync('pte_robsten.json', 'utf-8'));
        const contractAddress = process.env.CHAIN != "mainnet" ? process.env.PEET_CONTRACT_ADDR_TEST : process.env.PEET_CONTRACT_ADDR;
        const contract = new this.web3.eth.Contract(abiArray, contractAddress);
        //let balance = await contract.methods.balanceOf(process.env.PEET_PAY_WALLET_ADDR).call();
        const count = await this.web3.eth.getTransactionCount(process.env.PEET_PAY_WALLET_ADDR);

        if(amount < 0) {
            record.state = 5;
            console.log("The PTE amount is below 0")
            await record.save();
            return;
        }

        let data = contract.methods.transfer(to, this.web3.utils.toWei(amount.toString(), 'ether')).encodeABI();
        let baseGasPrice = Number((await this.web3.eth.getGasPrice()));
        let estimatedGas = await this.getEstimateGas(to, data);
        let gasPrice = (estimatedGas * baseGasPrice);
        const gasPteFees = await this.convertEthPriceToPtePrice(this.web3.utils.fromWei((estimatedGas * baseGasPrice).toString(), 'ether'));
        amount = (amount - gasPteFees).toFixed(8);
        record.amountPte = amount;
        record.gasPrice = this.web3.utils.fromWei(gasPrice.toString(), "ether");
        await record.save();

        if(amount < 0) {
            record.state = 5;
            console.log("The PTE amount is below 0")
            await record.save();
            return;
        }

        data = contract.methods.transfer(to, this.web3.utils.toWei(amount.toString(), 'ether')).encodeABI();
        let rawTransaction = {
            "from": process.env.PEET_PAY_WALLET_ADDR,
            "nonce": "0x" + count.toString(16),
            "gasPrice": this.web3.utils.toHex(baseGasPrice.toString()),
            "gasLimit": this.web3.utils.toHex((await this.web3.eth.getBlock("latest")).gasLimit),
            "to": contractAddress,
            "value": "0x0",
            "data": data
        };
        var privKey = Buffer.from(process.env.PEET_PAY_WALLET_PRIVATE_KEY, 'hex');
        var tx = new Transaction(rawTransaction, { chain: process.env.CHAIN });
        tx.sign(privKey);
        var serializedTx = tx.serialize();
        console.log(`Attempting to send signed tx:  ${serializedTx.toString('hex')}`);
        var receipt = await this.web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
        console.log("TxHash: " + receipt.transactionHash);

        // Update record
        record.pteTx = receipt.transactionHash;
        record.state = 3;
        await record.save();
    }

    async convertEthPriceToPtePrice(amount) {
        const PTE = await Fetcher.fetchTokenData(ChainId.MAINNET, this.web3.utils.toChecksumAddress(process.env.PEET_CONTRACT_ADDR));
        const ETH = await Fetcher.fetchTokenData(ChainId.MAINNET, this.web3.utils.toChecksumAddress(process.env.ETH_CONTRACT_ADDR));
        
        const pair = await Fetcher.fetchPairData(PTE, ETH);
        const route = new Route([pair], ETH)
        const result = parseFloat(parseFloat(route.midPrice.toSignificant(6)) * amount).toFixed(8);
        return result;
    }

    async getGasPriceAsPte() {
        return parseFloat(await this.convertEthPriceToPtePrice(this.web3.utils.fromWei(await this.web3.eth.getGasPrice(), 'ether'))).toFixed(8);
    }

    async getGasPriceAsEth() {
        return parseFloat(this.web3.utils.fromWei(await this.web3.eth.getGasPrice(), 'ether')).toFixed(8);
    }

    async getEstimateGas(to, data) {
        var result = await this.web3.eth.estimateGas({
            to: to, 
            data: data
        });
        return result;
    }

    async getTotalPTEGiven() {
        const records = await DB.getModels().PaymentBridgeRequest.findAll({
            where: {
                state: 3
            }
        });
        return records.map(x => x.amountPte).reduce((a, b) => a + b);
    }

    async getCurrentBonusRange() {
        const totalGiven = await this.getTotalPTEGiven();
        for(const range of getBonusRanges()) {
            if(totalGiven >= range.from && totalGiven < range.to) {
                return range.percent;
            }
        }
        return 0;
    }

    async addRewardToPTEAmount(amount) {
        const bonus = await this.getCurrentBonusRange();
        if(bonus == 0) return amount;
        return (parseFloat(amount) + ((bonus / 100) * parseFloat(amount))).toFixed(8);
    }
}