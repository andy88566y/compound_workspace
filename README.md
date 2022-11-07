# Compound Practice Project

for HW week 11

1. set up .env file like this

```
ETHERSCAN_API_KEY=SAMPLE_API_KEY
URL=alchemyapi/endpoint
```

2.

```shell
npm install
npx hardhat test
```

應該會看到如圖結果
![test pass](https://i.imgur.com/gxI3oPn.png)

有一串 `Duplicate definition of ActionPaused (ActionPaused(string,bool), ActionPaused(address,string,bool))` 不知道怎麼解
到底是 logger 問題，還是 compile 的時候太敏感，不是很懂
