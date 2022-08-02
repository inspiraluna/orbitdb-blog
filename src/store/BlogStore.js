import { observable } from 'mobx'
import Identities from 'orbit-db-identity-provider'
import OrbitDB from 'orbit-db'

class BlogStore {
  @observable posts = [];
  @observable data = {
    title: "Welcome to Nico-Krause.com!"
  };
  @observable isOnline = false;
  @observable currentPost = {};

  constructor() {
    this.ipfs = null;
    this.odb = null;
    this.feed = null;
  }

  async connect(ipfs, options = {}) {
    //set up orbitdb
    this.ipfs = ipfs;
    const identity =
      options.identity || (await Identities.createIdentity({ id: "user" }));

    this.odb = await OrbitDB.createInstance(ipfs, {
      identity,
      directory: "./odb",
    });

    const publicAccess = true;
    this.feed = await this.odb.open("testOrbit01", {
      create: true, // If database doesn't exist, create it
      overwrite: true, // Load only the local version of the database, don't load the latest from the network yet
      localOnly: false,
      type: "feed", //eventlog,feed,keyvalue,docstore,counter
      // If "Public" flag is set, allow anyone to write to the database,
      // otherwise only the creator of the database can write
      accessController: {
        write: publicAccess ? ["*"] : [orbitdb.identity.id],
      },
    });
    await this.loadPosts();
    this.isOnline = true;
  }

  addPostToStore = (entry) => {
    if (
      this.posts.filter((e) => {
        return e.hash === entry.hash;
      }).length === 0
    ) {
      const newPostObj = {
        hash: entry.hash,
        subject: entry.payload.value.subject || entry.payload.value.name,
        body: entry.payload.value.body,
        address: entry.payload.value.address,
      };
      console.log("adding newPostObj to posts store", newPostObj);
      this.posts.push(newPostObj);
    }
  };
  async loadPosts() {
    // this.feed = await this.odb.feed(this.odb.identity.id + '/playlists')

    this.feed.events.on("replicated", async (dbAddress, count, newFeed, d) => {
      this.feed = await newFeed.load();
      console.log("replicated - loading posts from db");
      console.log("dbNmae", dbAddress);
      console.log("count", count);
      console.log("feed", newFeed);
      newFeed.all.map(this.addPostToStore);
      //remove remotely deleted entries from playlist store
    });

    this.feed.events.on("write", async (hash, entry, heads) => {
      console.log("wrote something adding to Posts" + hash, entry);
      this.addPostToStore(entry);
    });
    // When the database is ready (ie. loaded), display results
    this.feed.events.on("ready", (a, b) => {
      console.log("database ready " + a, b);
      this.feed.all.map(this.addPostToStore);
    });

    this.feed.events.on("replicate.progress", async (dbAddress, hash, obj) => {
      // await this.feed.load()
      console.log("replicate.progress", dbAddress, hash, obj);
      console.log("this.playlists.length", this.posts.length);
      // const filteredData = this.playlists.filter(item => {
      //   console.log('item.hash',item.hash,hash)
      //   return item.hash !== hash}
      //   );
      // this.playlists.replace(filteredData);
      console.log("this.playlists.length", this.posts.length);
      this.feed = await this.feed.load();
      const entry = await feed.get(hash);
      for (let i = 0; i < this.posts.length; i++) {
        console.log(">", this.posts[i].hash, this.posts[i].address);
        if (this.posts[i].hash === entry.hash) {
          console.log(
            "removed playlist from store because it was deleted on another node",
            entry.hash
          );
          this.playlist = this.posts.splice(i, 1);
        }
        //   console.log("syncing",this.playlists[i].hash)
        //   const entry = await newFeed.get(this.playlists[i].hash)
        //   console.log(entry)
        //   if(entry===undefined) {
        // this.removePlaylist(hash)
      }

      // }
    });
    await this.feed.load();
  }

  /**
   * Create a new feed for every post
   */
  async createNewPost(subject,body) {
    // const postsFeed = this.feed
    // Creates a new feed for every playlist (or post)
    console.log("creating new postFeed", subject);
    
    const postsFeed = await this.odb.feed(subject, {
      accessController: { type: "orbitdb", write: [this.odb.identity.id] },
    })

    const p = {
      subject: subject,
      body: body,
      createdAt: new Date().getTime(),
      address: postsFeed.address.toString(),
    }
    //next we add it to our saved playlists feed
    const hash = await this.feed.add(p);
    return hash;
  }

  async removePost(ourHash) {
    const filteredData = this.posts.filter((item) => item.hash !== ourHash);
    this.posts.replace(filteredData);
    const hash = await this.feed.remove(ourHash);
    console.log(hash, ourHash);
    return hash;
  }

  async joinBlogPost(address) {
    console.log("joinBlogPost - loading address", address);
    if (this.odb) {
      const blogPost =
        this.odb.stores[address] || (await this.odb.open(address));
      await blogPost.load();
      this.currentPost = blogPost;
      console.log('currentPost',this.currentPost)
    }
  }

  sendFiles(files, address) {
    const promises = [];
    for (let i = 0; i < files.length; i++) {
      promises.push(this._sendFile(files[i], address));
    }
    return Promise.all(promises);
  }

  async _sendFile(file, address) {
    console.log("file", file);
    console.log("address", address);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const f = await this.addFile(address, {
          filename: file.name,
          buffer: event.target.result,
          meta: { mimeType: file.type, size: file.size },
        });
        resolve(f);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async addFile(address, source) {
    if (!source || !source.filename) {
      throw new Error("Filename not specified");
    }
    const isBuffer = source.buffer && source.filename;
    const name = source.filename.split("/").pop();
    console.log("filename", name);
    const size = source.meta && source.meta.size ? source.meta.size : 0;

    const result = await this.ipfs.add(Buffer.from(source.buffer));
    console.log("result of ipfs.add", result);
    const hash = result.path;

    console.log("upload hash (cid)", hash);

    // Create a post
    const data = {
      content: hash,
      meta: Object.assign(
        {
          from: this.odb.identity.id,
          type: "file",
          ts: new Date().getTime(),
        },
        { size, name },
        source.meta || {}
      ),
    };

    return await this.addPost(address, data);
  }

  async addPost(address, data) {
    console.log("adding data to db on address", address);
    const blogPost = this.odb.stores[address] || (await this.odb.open(address));
    if (blogPost) {
      const hash = await blogPost.add(data);
      console.log("got hash", hash);
      await blogPost.load();
      this.currentPost = blogPost;
      console.log("blogPost feed loaded", this.currentPost);
      return blogPost.get(hash);
    }
    return;
  }
}

const store = window.store = new BlogStore()
export default store
