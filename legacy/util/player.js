const ytdl = require(`ytdl-core`);
const Spot = require(`simple-spotify`).Spotify; const Youtube = require(`youtube-sr`).default; const Spotify = new Spot();
const { Message, Client, Collection, Guild, Intents } = require(`discord.js`);
const { Construct, allIntents, BetterArr, Util } = require(`./util.js`);
const VoiceDiscord = require(`@discordjs/voice`);
const { promisify } = require(`util`);

const Options = {
  leaveOnEnd: true,
  leaveOnStop: true,
  leaveOnEmpty: true,
  leaveOnEmptyCooldown: 1000,
  autoSelfDeaf: false,
  initialVolume: 100,
}

const { VoiceConnectionStatus, VoiceConnectionDisconnectReason, entersState, AudioPlayerStatus, createAudioResource } = require(`@discordjs/voice`);
const util = new Util();

class Player extends Util {
  /**
   * Discord Player for a music bot
   * @param {Client} client - Music Client
   * @param {Options} options - Player Options
   */
  constructor(client, options) {
    super(client)
    this.settings = {
      leaveOnEnd: options?.leaveOnEnd || true,
      leaveOnStop: options?.leaveOnStop || true,
      leaveOnEmpty: options?.leaveOnEmpty || true,
      leaveOnEmptyCooldown: options?.leaveOnEmptyCooldown || 1000,
      autoSelfDeaf: options?.autoSelfDeaf || false,
      initialVolume: options?.initialVolume || 100,
    }
    client.playoptions = this.settings;
  }

  getQueue(message) {
    let queue = this.client.constructs.get(message.guild.id);
    if (queue) {
      return queue
    } else return undefined
  }

  /**
   * @param {Message} message 
   * @param {String} song 
   * @param {String} type 
   */
  async play(message, song, type) {
    switch (type) {
      case "firsttime":
        await firsttime(message, song, this)
        break;
      case "trackAdd":
        break;
      case "queue":
        break;
    }
  }

  /**
   * @param {Track} song 
   * @returns {String}
   */
  async checkAndGiveUrl(song) {
    let url;
    song.type == `youtube` ? url = song.url : url = await song.youtube_link();

    return url;
  }
}

/**
 * @param {Message} message 
 * @param {String} song 
 * @param {Player} player
 */
async function firsttime(message, song, player) {
  if (typeof song != `string`) return new Error(`Expect String got ${typeof song}`);
  const { guild, client } = message;

  let construct;

  if (!client.constructs.has(guild.id)) {

    let connection = VoiceDiscord.joinVoiceChannel({
      guildId: guild.id,
      channelId: message.member.voice.channel.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: player.settings.autoSelfDeaf,
      selfMute: false
    });

    construct = new GuildSub(message, connection);
    client.constructs.set(guild.id, construct);

  } else construct = client.constructs.get(guild.id);

  let tracks = await player.queryType(song, message, true);
  construct.queue.add(tracks);

  await construct.process();

}

class GuildSub {
  /**
 * @param {VoiceDiscord.VoiceConnection} connection - Voice Connection
 * @param {Message} message - Command Message
 */
  constructor(message, connection) {
    this.message = message;
    this.client = message.client;
    this.textChannel = message.channel;

    this.connection = connection;
    this.queue = new BetterArr();
    this.voiceChannel = message.member.voice.channel;
    this.audioPlayer = VoiceDiscord.createAudioPlayer();

    this.nowplaying = false;
    this.paused = false;
    this.volume = (this.client.playoptions.initialVolume)
    this.player = this.client.player;

    this.connection.on('stateChange', async (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
          try {
            await entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000);
          } catch {
            this.connection.destroy();
          }
        } else if (this.connection.rejoinAttempts < 5) {
          await wait((this.cnnection.rejoinAttempts + 1) * 5_000);
          this.connection.rejoin();
        } else {
          this.connection.destroy();
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.stop();
      } else if (
        !this.readyLock &&
        (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
      ) {
        this.readyLock = true;
        try {
          await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
          if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
        } finally {
          this.readyLock = false;
        }
      }
    });


    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        console.log(`finished`);
        /*
        (oldState.resource as AudioResource<Track>).metadata.onFinish();
        void this.processQueue();
        */
      } else if (newState.status === AudioPlayerStatus.Playing) {
        console.log(`started`);
        /*
        // If the Playing state has been entered, then a new track has started playback.
        (newState.resource as AudioResource<Track>).metadata.onStart();
        */
      }
    });

    this.audioPlayer.on('error', (error) => this.player.emit(`err`, error));

    this.connection.subscribe(this.audioPlayer);
  }

  async addTrack(track) {
    if (track instanceof Track) {
      this.queue.push(track);
    } else {
      let tracks = await util.queryType(track, this.message, true);
      this.queue.add(tracks)
    }
  }

  stop() {
    this.queueLock = true;
    this.queue.empty();
    this.audioPlayer.stop(true);
    this.client.constructs.delete(this.message.guildId)
  }

  pause() {
    if (!this.connection) return;
    this.audioPlayer.pause();
    this.paused = this.paused ? false : true
  }

  clear() {
    if (this.queueLock) return;
    this.queue.empty();
  }

  shuffle() {
    if (this.queueLock) return;
    this.queue.shuffle();
  }

  async process() {
    if (this.queueLock || this.audioPlayer.state.status !== AudioPlayerStatus.Idle || this.queue.length === 0) {
      return;
    }
    this.queueLock = true;
    const nextTrack = this.queue.shift();
    try {
      this.resource = await nextTrack.createAudioResource();
      this.resource.volume.setVolumeLogarithmic(this.volume / 100);
      this.audioPlayer.play(this.resource);
      this.playing = nextTrack;
      this.queueLock = false;
    } catch (error) {
      console.log(error)
      this.player.emit(`err`, error);
      this.client.constructs.delete(this.message.guildId)
      this.queueLock = false;
      return this.process();
    }
  }

  setVolume(value) {
    if (!this.resource || isNaN(value) || value < 0 || value > Infinity) return false;

    this.resource.volume.setVolumeLogarithmic(value / 100);
    return true;
  }

}

module.exports = { Player, Util, Construct, allIntents }