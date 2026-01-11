// Supabase client
// This file handles all database operations using Supabase

// Initialize Supabase client
let supabaseClient = null;

function initSupabase() {
  if (typeof BLOG_CONFIG !== 'undefined' && BLOG_CONFIG.supabase) {
    const { url, anonKey } = BLOG_CONFIG.supabase;

    // Check if Supabase SDK is loaded
    if (url && anonKey && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      try {
        supabaseClient = window.supabase.createClient(url, anonKey);
        console.log('✅ Supabase initialized successfully');
        console.log('📍 Connected to:', url);
        return true;
      } catch (error) {
        console.error('❌ Supabase initialization failed:', error);
        return false;
      }
    } else {
      console.warn('⚠️ Supabase SDK not loaded or config incomplete');
    }
  }

  console.warn('⚠️ Supabase not configured, falling back to localStorage');
  return false;
}

// Database operations wrapper
const DB = {
  // Initialize on page load
  init: initSupabase,

  // Check if Supabase is available
  isAvailable: () => supabaseClient !== null,

  // Posts operations
  posts: {
    // Get all posts by category
    async getByCategory(category) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('posts')
          .select('*')
          .eq('category', category)
          .order('date', { ascending: false });

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error fetching posts:', error);
        return null;
      }
    },

    // Get all posts from multiple categories
    async getByCategories(categories) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('posts')
          .select('*')
          .in('category', categories)
          .order('date', { ascending: false });

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error fetching posts:', error);
        return null;
      }
    },

    // Get single post by ID
    async getById(id) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('posts')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error fetching post:', error);
        return null;
      }
    },

    // Create new post
    async create(postData) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('posts')
          .insert([postData])
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error creating post:', error);
        return null;
      }
    },

    // Update existing post
    async update(id, postData) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('posts')
          .update({ ...postData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error updating post:', error);
        return null;
      }
    },

    // Delete post
    async delete(id) {
      if (!supabaseClient) return null;

      try {
        const { error } = await supabaseClient
          .from('posts')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return true;
      } catch (error) {
        console.error('Error deleting post:', error);
        return false;
      }
    }
  },

  // Comments operations
  comments: {
    // Get comments for a post
    async getByPostId(postId) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('comments')
          .select('*')
          .eq('post_id', postId)
          .order('timestamp', { ascending: false });

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error fetching comments:', error);
        return null;
      }
    },

    // Add comment
    async create(commentData) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('comments')
          .insert([commentData])
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error creating comment:', error);
        return null;
      }
    }
  },

  // Likes operations
  likes: {
    // Get like count for a post
    async getCount(postId) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('like_counts')
          .select('count')
          .eq('post_id', postId)
          .single();

        if (error && error.code === 'PGRST116') {
          // No record found, return 0
          return { count: 0 };
        }
        if (error) throw error;
        return data;
      } catch (error) {
        console.error('Error fetching like count:', error);
        return { count: 0 };
      }
    },

    // Check if user liked a post
    async checkUserLike(postId, userFingerprint) {
      if (!supabaseClient) return null;

      try {
        const { data, error } = await supabaseClient
          .from('likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_fingerprint', userFingerprint)
          .single();

        if (error && error.code === 'PGRST116') {
          // No record found
          return false;
        }
        if (error) throw error;
        return true;
      } catch (error) {
        console.error('Error checking like:', error);
        return false;
      }
    },

    // Toggle like
    async toggle(postId, userFingerprint) {
      if (!supabaseClient) return null;

      try {
        // Check if already liked
        const liked = await this.checkUserLike(postId, userFingerprint);

        if (liked) {
          // Unlike: remove from likes table
          const { error: deleteError } = await supabaseClient
            .from('likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_fingerprint', userFingerprint);

          if (deleteError) throw deleteError;

          // Decrease count
          const { data: currentCount } = await this.getCount(postId);
          const newCount = Math.max(0, (currentCount?.count || 1) - 1);

          const { error: updateError } = await supabaseClient
            .from('like_counts')
            .upsert({ post_id: postId, count: newCount });

          if (updateError) throw updateError;

          return { liked: false, count: newCount };
        } else {
          // Like: add to likes table
          const { error: insertError } = await supabaseClient
            .from('likes')
            .insert([{
              id: Date.now().toString(),
              post_id: postId,
              user_fingerprint: userFingerprint
            }]);

          if (insertError) throw insertError;

          // Increase count
          const { data: currentCount } = await this.getCount(postId);
          const newCount = (currentCount?.count || 0) + 1;

          const { error: updateError } = await supabaseClient
            .from('like_counts')
            .upsert({ post_id: postId, count: newCount });

          if (updateError) throw updateError;

          return { liked: true, count: newCount };
        }
      } catch (error) {
        console.error('Error toggling like:', error);
        return null;
      }
    }
  }
};

// Generate simple user fingerprint (not perfect but good enough)
function getUserFingerprint() {
  let fingerprint = localStorage.getItem('user_fingerprint');

  if (!fingerprint) {
    // Create a simple fingerprint based on browser info
    fingerprint = btoa(
      navigator.userAgent +
      navigator.language +
      screen.width +
      screen.height +
      Date.now() +
      Math.random()
    ).substring(0, 32);

    localStorage.setItem('user_fingerprint', fingerprint);
  }

  return fingerprint;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  DB.init();
});
