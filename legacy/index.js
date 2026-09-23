const { Client, Intents, Collection } = require(`discord.js`);
const mongoose = require(`mongoose`);
const { Player } = require(`discord-player`);
const { Util, allIntents, Artist } = require(`./util/player.js`);
const client = new Client({intents: [Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MEMBERS], presence: { status: `dnd` } });
require(`dotenv`).config();
require(`./util/commandhandler.js`)(client);

const { TOKEN, MONGO_PATH } = process.env

client.player = new Player(client, {
  connectionTimeout: 10000
});

client.player.on(`error`, async (q, err) => console.log(err))

client.on(`ready`, async () => {
  console.log(`Logged into ${client.user.tag}\nBot Invite: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`)
  mongoose.connect(MONGO_PATH, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => console.log(`Mongoose Connection Established`))
  //client.constructs = new Collection();
  client.util = new Util(client);
})

client.login(TOKEN)
