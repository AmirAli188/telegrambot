require("dotenv").config()
const {Telegraf , session} = require("telegraf")
const ytdlwrap = require("yt-dlp-wrap").default
const fs = require("fs")
const path = require('path')
const bot = new Telegraf(process.env.BOT_TOKEN , {handlerTimeout : 9000000})
const ytdlW = new ytdlwrap()
const channelUsername = JSON.parse(process.env.CHANNEL_USERNAME)
const config = JSON.parse(process.env.FTP_CONFIG);
const ftpClient = require("ftp")
const client = new ftpClient()
const db = require('./db');


function resetConnection() {
    client.end(); 
    client.connect(config); 
}

async function uploatToFtp(pathToUpload , data) {
    return new Promise(async(resolve)=>{
        client.put(data , pathToUpload , err=>{
            if(err){
                throw err ;
            }else{
                resolve()
            }
        })

    })
  
}        
async function downloadPlaylistAndVideo(url) {
    try {
        const folder = `downloads/${Date.now()}`
        await ytdlW.execPromise(["--cookies-from-browser" , "firefox",
            url , '-P' , folder , '-o','%(playlist_index)s-%(title)s.%(ext)s' , '--yes-playlist',
        ] , {timeout : 0})
        return folder;
        
    } catch (error) {
        console.log(error);
    }
}
async function validateUrl(url){
   try {    
    const output =  await ytdlW.execPromise(["--cookies-from-browser" , "firefox" ,  url , '--print' , '%(id)s' ,
        '--quiet' , '--no-warnings'])
        
        if(!output.trim()) return false
        return true
   } catch (error) {
    
    return false
   }
}
async function Upload(folderPath,ctx) {
    return new Promise((resolve)=>{
        client.on("ready" ,async ()=>{
            const files = await fs.readdirSync(folderPath)
            files.forEach(async(file)=>{
                    const filePath = path.join(  folderPath , file)                  
                    const foldername = folderPath.replace("downloads" , "")
                    const uniqueFileName = foldername+`${Date.now()}.mp4`
                    const pathToUpload = "/www" + uniqueFileName
                    const data = await fs.readFileSync(filePath)
                    await uploatToFtp(pathToUpload , data)
                    const result = await fs.rmSync(filePath);
                    let message = await ctx.reply(`https://dl.malekidev.ir/${uniqueFileName}`)
            })
            resolve()
        })
        client.connect(config)
    })
}
async function checkMembership(ctx){
    return new Promise(async(resolve)=>{
    let notMember = []
    for (const channel of channelUsername) {
        const channelInfo = await ctx.telegram.getChat(channel.channelID)
        const channelID =channelInfo.id
        const member =  await ctx.telegram.getChatMember(channelID , ctx.from.id)
        if(member.status === 'kicked' || member.status === 'left'){
            notMember.push(channel)
        } 
    }

    resolve(notMember)
    
    })
}
async function createJoiningChannelMessage(ctx){
    return new Promise(async(resolve)=>{
        const notMember = await checkMembership(ctx)
        let buttons = []
        if(notMember.length >0){
         buttons = notMember.map(channel =>[{url : channel.channelURL , text: channel.channelURL}])
        buttons.push([{text : 'Check subscription' , callback_data : 'check_subscription'}])
        }
        resolve(buttons)
    })
}
async function getUser(userID) {
    return new Promise((resolve)=>{
        db.query('SELECT * FROM users WHERE user_id = ?' , [userID] , (err,results)=>{
            if(!err){
                if(results.length>0){
                    resolve(true)
                }else{
                    resolve(false)
                }
            }
        })
    })
}
async function addUser(userID) {
    return new Promise((resolve,reject)=>{
        db.query('INSERT INTO users (user_id) VALUES (?)',[userID],(err)=>{
            if(err) reject()
            resolve()
        })
    })
}

client.on("ready", () => {
    // Periodically send a NOOP command to keep the connection alive
    setInterval(() => {
        client.pwd((err, currentDir) => {
            if (err) console.error("Error sending keep-alive command:", err);
            else console.log("Keep-alive command sent, current directory:", currentDir);
        });
    }, 300000); // Send NOOP every 5 minutes (300000 ms)
});

// Your existing connection and upload logic here

client.on("error", (err) => {
    if (err) {
        if (err.message.includes("No transfer timeout")) {
            resetConnection();
        }
    }
    
});
  


bot.start(async(ctx)=>{
    
    const doesUserExist = await getUser(ctx.from.id)
    console.log("wnfkwn");
    if(!doesUserExist){
        await addUser(ctx.from.id)
    } 
    const buttons = await createJoiningChannelMessage(ctx)
    if(buttons.length > 0){
        return await ctx.reply("join these channels" , {reply_markup : {inline_keyboard : buttons}})
    }
    ctx.reply(
    "send the link of your youtube file"
)})
bot.on('callback_query' ,async (ctx)=>{

    if(ctx.callbackQuery.data === 'check_subscription'){
        const notMember = await checkMembership(ctx);
        if (notMember.length > 0) {
            const buttons = await createJoiningChannelMessage(ctx);
            const message = await ctx.reply("Join these channels", { reply_markup: { inline_keyboard: buttons } });
            await ctx.deleteMessage()
        }else{
            await ctx.deleteMessage()
            await ctx.reply("You have already joined all the required channels. Thank you!");

        }
    }
})
bot.launch()


try {
    bot.on("text" , async (ctx)=>{
        
        const buttons = await createJoiningChannelMessage(ctx)
        if(buttons.length > 0){
            return await ctx.reply("join these channels" , {reply_markup : {inline_keyboard : buttons}})
        }
        const url  = ctx.message.text      
        const processingMessage = await ctx.reply("processing").catch((err)=>{console.log(err);})
        const validation = await validateUrl(url)
        await ctx.telegram.deleteMessage(ctx.chat.id , processingMessage.message_id).catch((err)=>{console.log(err);})
        if(!validation) return ctx.reply("please enter a valid url").catch((err)=>{console.log(err);})
        const downloadingMessage = await ctx.reply("downloading...").catch((err)=>{console.log(err);})
        await ctx.replyWithChatAction("upload_document").catch((err)=>{console.log(err);})
        const folderPath =await downloadPlaylistAndVideo(url)
        await ctx.telegram.deleteMessage(ctx.chat.id , downloadingMessage.message_id).catch((err)=>{console.log(err);})
        const uploadingMessage = await ctx.reply(" uploading videos to the server...").catch((err)=>{console.log(err);})
        await Upload(folderPath , ctx)
        await ctx.telegram.deleteMessage(ctx.chat.id , uploadingMessage.message_id).catch((err)=>{console.log(err);})

    
    })
    bot.catch(async(err , ctx)=>{
        await ctx.reply("an error occured , try again later")
    })
} catch (error) {
    console.log("internal server error");
    
}
