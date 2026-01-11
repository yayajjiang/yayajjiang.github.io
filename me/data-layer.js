// Data layer - handles both localStorage and Supabase
// Automatically falls back to localStorage if Supabase is not available

// Data layer wrapper
const DataLayer = {
  // Posts operations
  async getPosts(category = 'all') {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        let posts;
        if (category === 'all') {
          const categories = ['articles', 'links', 'life', 'projects'];
          posts = await DB.posts.getByCategories(categories);
        } else {
          posts = await DB.posts.getByCategory(category);
        }

        if (posts !== null) {
          return posts;
        }
      } catch (error) {
        console.warn('Supabase error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage
    if (category === 'all') {
      const categories = ['articles', 'links', 'life', 'projects'];
      let allPosts = [];

      categories.forEach(cat => {
        const storageKey = `blog_posts_${cat}`;
        const posts = JSON.parse(localStorage.getItem(storageKey) || '[]');
        allPosts = allPosts.concat(posts);
      });

      // Sort by date
      allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
      return allPosts;
    } else {
      const storageKey = `blog_posts_${category}`;
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    }
  },

  async getPost(id) {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const post = await DB.posts.getById(id);
        if (post !== null) {
          return post;
        }
      } catch (error) {
        console.warn('Supabase error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage - search all categories
    const categories = ['articles', 'links', 'reading', 'media', 'life', 'projects'];
    for (const cat of categories) {
      const storageKey = `blog_posts_${cat}`;
      const posts = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const post = posts.find(p => p.id === id);
      if (post) return post;
    }

    return null;
  },

  async createPost(postData) {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const result = await DB.posts.create(postData);
        if (result !== null) {
          // Also save to localStorage as backup
          this.saveToLocalStorage(postData);
          return result;
        }
      } catch (error) {
        console.warn('Supabase error, saving to localStorage only:', error);
      }
    }

    // Fallback to localStorage
    return this.saveToLocalStorage(postData);
  },

  async updatePost(id, postData) {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const result = await DB.posts.update(id, postData);
        if (result !== null) {
          // Also update localStorage as backup
          this.updateLocalStorage(id, postData);
          return result;
        }
      } catch (error) {
        console.warn('Supabase error, updating localStorage only:', error);
      }
    }

    // Fallback to localStorage
    return this.updateLocalStorage(id, postData);
  },

  async deletePost(id, category) {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const result = await DB.posts.delete(id);
        if (result) {
          // Also delete from localStorage
          this.deleteFromLocalStorage(id, category);
          return true;
        }
      } catch (error) {
        console.warn('Supabase error, deleting from localStorage only:', error);
      }
    }

    // Fallback to localStorage
    return this.deleteFromLocalStorage(id, category);
  },

  // Comments operations
  async getComments(postId) {
    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const comments = await DB.comments.getByPostId(postId);
        if (comments !== null) {
          return comments;
        }
      } catch (error) {
        console.warn('Supabase error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage
    const commentsKey = `post_comments_${postId}`;
    return JSON.parse(localStorage.getItem(commentsKey) || '[]');
  },

  async addComment(postId, commentData) {
    const comment = {
      id: Date.now().toString(),
      post_id: postId,
      display_name: commentData.displayName,
      contact: commentData.contact || '',
      content: commentData.content,
      timestamp: new Date().toISOString()
    };

    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const result = await DB.comments.create(comment);
        if (result !== null) {
          // Also save to localStorage as backup
          this.saveCommentToLocalStorage(postId, comment);
          return result;
        }
      } catch (error) {
        console.warn('Supabase error, saving to localStorage only:', error);
      }
    }

    // Fallback to localStorage
    return this.saveCommentToLocalStorage(postId, comment);
  },

  // Likes operations
  async getLikes(postId) {
    const userFingerprint = getUserFingerprint();

    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const [countData, liked] = await Promise.all([
          DB.likes.getCount(postId),
          DB.likes.checkUserLike(postId, userFingerprint)
        ]);

        if (countData !== null) {
          return {
            count: countData.count || 0,
            liked: liked
          };
        }
      } catch (error) {
        console.warn('Supabase error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage
    const likesKey = `post_likes_${postId}`;
    const userLikesKey = 'user_liked_posts';

    const count = parseInt(localStorage.getItem(likesKey) || '0');
    const userLikes = JSON.parse(localStorage.getItem(userLikesKey) || '[]');
    const liked = userLikes.includes(postId);

    return { count, liked };
  },

  async toggleLike(postId) {
    const userFingerprint = getUserFingerprint();

    // Try Supabase first
    if (DB.isAvailable()) {
      try {
        const result = await DB.likes.toggle(postId, userFingerprint);
        if (result !== null) {
          // Also update localStorage as backup
          this.toggleLikeLocalStorage(postId);
          return { likes: result.count, liked: result.liked };
        }
      } catch (error) {
        console.warn('Supabase error, using localStorage only:', error);
      }
    }

    // Fallback to localStorage
    return this.toggleLikeLocalStorage(postId);
  },

  // LocalStorage helper methods
  saveToLocalStorage(postData) {
    const storageKey = `blog_posts_${postData.category}`;
    let posts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    posts.unshift(postData);
    localStorage.setItem(storageKey, JSON.stringify(posts));
    return postData;
  },

  updateLocalStorage(id, postData) {
    const storageKey = `blog_posts_${postData.category}`;
    let posts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const index = posts.findIndex(p => p.id === id);

    if (index !== -1) {
      posts[index] = { ...posts[index], ...postData };
      localStorage.setItem(storageKey, JSON.stringify(posts));
      return posts[index];
    }

    return null;
  },

  deleteFromLocalStorage(id, category) {
    const storageKey = `blog_posts_${category}`;
    let posts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    posts = posts.filter(p => p.id !== id);
    localStorage.setItem(storageKey, JSON.stringify(posts));
    return true;
  },

  saveCommentToLocalStorage(postId, comment) {
    const commentsKey = `post_comments_${postId}`;
    let comments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    comments.push(comment);
    localStorage.setItem(commentsKey, JSON.stringify(comments));
    return comment;
  },

  toggleLikeLocalStorage(postId) {
    const likesKey = `post_likes_${postId}`;
    const userLikesKey = 'user_liked_posts';

    let likes = parseInt(localStorage.getItem(likesKey) || '0');
    let userLikes = JSON.parse(localStorage.getItem(userLikesKey) || '[]');

    const liked = userLikes.includes(postId);

    if (liked) {
      likes = Math.max(0, likes - 1);
      userLikes = userLikes.filter(id => id !== postId);
    } else {
      likes += 1;
      userLikes.push(postId);
    }

    localStorage.setItem(likesKey, likes.toString());
    localStorage.setItem(userLikesKey, JSON.stringify(userLikes));

    return { likes, liked: !liked };
  }
};
