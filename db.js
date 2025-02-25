require("dotenv").config()
const mysql = require('mysql2')
const config = JSON.parse(process.env.DB_CONFIG)

const db = mysql.createConnection(config)
db.connect((err)=>{
    try {
        if(err) throw err
    } catch (error) {
        console.log(error);
    }
})
module.exports = db