require("dotenv").config()
const {Telegraf} = require("telegraf")
const ytdlwrap = require("yt-dlp-wrap").default
const fs = require("fs")
const path = require('path')
const bot = new Telegraf(process.env.BOT_TOKEN , {handlerTimeout : 9000000})
const ytdlW = new ytdlwrap()
const channelUsername = process.env.CHANNEL_USERNAME
const config = JSON.parse(process.env.FTP_CONFIG);
const ftpClient = require("ftp")
const client = new ftpClient()



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
        await ytdlW.execPromise([
            url , '-P' , folder , '-o','%(playlist_index)s-%(title)s.%(ext)s' , '--yes-playlist'
        ] , {timeout : 0})
        return folder;
        
    } catch (error) {
        console.log(error);
    }
}
async function validateUrl(url){
   try {    
    const output =  await ytdlW.execPromise([ url , '--print' , '%(id)s' ,
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

bot.start((ctx)=>{
    ctx.reply(
    "send the link of your youtube file"
)})
bot.launch()
bot.help((ctx)=>{
    ctx.reply(" You can provide me a valid video or playlist link , and i will download it and send the download links for you ")
})
bot.on("text" , async (ctx)=>{
    try {  
      const url  = ctx.message.text
      const channel = await ctx.telegram.getChat(channelUsername)
      const channelID =channel.id
      const member =  await ctx.telegram.getChatMember(channelID , ctx.from.id)
      
      if(member.status === 'kicked' || member.status === 'left'){
        return ctx.reply(`please join the channel first to use the bot , here's the link to the channel : ${channelUsername} `)
      }
    const processingMessage = await ctx.reply("processing")
    const validation = await validateUrl(url)
    await ctx.telegram.deleteMessage(ctx.chat.id , processingMessage.message_id)
    if(!validation) return ctx.reply("please enter a valid url")
    const downloadingMessage = await ctx.reply("downloading...")
     await ctx.replyWithChatAction("upload_document")
    const folderPath =await downloadPlaylistAndVideo(url)
    await ctx.telegram.deleteMessage(ctx.chat.id , downloadingMessage.message_id)
    const uploadingMessage = await ctx.reply(" uploading videos to the server...")
    await Upload(folderPath , ctx)
    await ctx.telegram.deleteMessage(ctx.chat.id , uploadingMessage.message_id)

    } catch (error) {
        ctx.reply("Internal Server Error , try again later")
        console.log(error);
        
    }
})
