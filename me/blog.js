// Blog functionality

// Admin authentication with persistent session
// Try to load from config.js (not committed to git), fallback to default
const ADMIN_PASSWORD = (typeof BLOG_CONFIG !== 'undefined' && BLOG_CONFIG.adminPassword)
  ? BLOG_CONFIG.adminPassword
  : 'my-new-password'; // Fallback password (change this!)
const ADMIN_SESSION_KEY = 'blog_admin_session';
const ADMIN_SESSION_DURATION = (typeof BLOG_CONFIG !== 'undefined' && BLOG_CONFIG.sessionDuration)
  ? BLOG_CONFIG.sessionDuration
  : 7 * 24 * 60 * 60 * 1000; // 7 days
let isAdminMode = false;

// Check if admin session is valid
function checkAdminSession() {
  const session = localStorage.getItem(ADMIN_SESSION_KEY);
  if (session) {
    const sessionData = JSON.parse(session);
    const now = new Date().getTime();
    if (now < sessionData.expiresAt) {
      return true;
    } else {
      // Session expired
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }
  return false;
}

// Create admin session
function createAdminSession() {
  const expiresAt = new Date().getTime() + ADMIN_SESSION_DURATION;
  const sessionData = {
    expiresAt: expiresAt,
    createdAt: new Date().getTime()
  };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
}

// Logout admin
function logoutAdmin() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  isAdminMode = false;
  hideAdminForm();
  const toggleBtn = document.querySelector('.admin-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = 'Admin Login';
  }
}

// Toggle admin form visibility
async function toggleAdminForm() {
  if (!isAdminMode) {
    // Check if session exists
    if (!supabaseClient) {
      alert('Supabase not initialized. Please refresh the page.');
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
      // Already logged in
      isAdminMode = true;
      showAdminForm();
    } else {
      // Need to login
      const email = prompt('Enter admin email:');
      const password = prompt('Enter admin password:');

      const { error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        alert('Login failed: ' + error.message);
      } else {
        isAdminMode = true;
        showAdminForm();
      }
    }
  } else {
    // Logout
    if (confirm('Logout from admin mode?')) {
      await supabaseClient.auth.signOut();
      logoutAdmin();
    } else {
      hideAdminForm();
    }
  }
}

function showAdminForm() {
  const forms = document.querySelectorAll('.admin-form');
  forms.forEach(form => {
    form.classList.add('show');
  });

  const toggleBtn = document.querySelector('.admin-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = 'Logout <span style="font-size:0.8em">(Hide: click again)</span>';
  }

  // Reload posts to show edit/delete buttons
  const categoryInput = document.querySelector('input[name="category"]');
  if (categoryInput) {
    loadPosts(categoryInput.value);
  }
}

function hideAdminForm() {
  const forms = document.querySelectorAll('.admin-form');
  forms.forEach(form => {
    form.classList.remove('show');
  });

  const toggleBtn = document.querySelector('.admin-toggle');
  if (toggleBtn && isAdminMode) {
    toggleBtn.textContent = 'Show Admin Panel';
  }

  // Reload posts to hide edit/delete buttons
  const categoryInput = document.querySelector('input[name="category"]');
  if (categoryInput) {
    loadPosts(categoryInput.value);
  }
}

// Initialize admin toggle button
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Supabase connection
  if (typeof DB !== 'undefined') {
    DB.init();
  }

  // Check if admin session exists on page load
  if (checkAdminSession()) {
    isAdminMode = true;
    // Auto-show admin form if session is valid
    showAdminForm();
  }

  // Add admin toggle button (only visible when you know it exists)
  const adminToggle = document.createElement('button');
  adminToggle.className = 'admin-toggle';
  adminToggle.textContent = isAdminMode ? 'Show Admin Panel' : 'Admin Login';
  adminToggle.onclick = toggleAdminForm;
  adminToggle.style.display = 'none'; // Hidden by default
  document.body.appendChild(adminToggle);

  // Press Ctrl+Shift+A to show admin toggle
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      adminToggle.style.display = adminToggle.style.display === 'none' ? 'block' : 'none';
      e.preventDefault();
    }
  });

  // Initialize Markdown editors
  initializeMarkdownEditors();
});

// Post submission handler using DataLayer
async function handlePostSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const category = formData.get('category');
  const form = event.target;

  // Check if we're editing an existing post
  const editingPostId = form.dataset.editingPostId;

  // Process date: if only YYYY-MM, append -01 for database compatibility
  let dateValue = formData.get('date');
  if (dateValue && dateValue.match(/^\d{4}-\d{2}$/)) {
    dateValue = dateValue + '-01';
  }

  const postData = {
    title: formData.get('title'),
    date: dateValue,
    category: category,
    content: formData.get('content') || '',
    excerpt: formData.get('excerpt') || '',
    url: formData.get('url') || '',
    author: formData.get('author') || '',
    rating: formData.get('rating') || null,
    type: formData.get('type') || '',
    tech: formData.get('tech') || ''
  };

  if (editingPostId) {
    // EDITING MODE - Update existing post
    postData.id = editingPostId;
    await DataLayer.updatePost(editingPostId, postData);
    alert('文章更新成功！');

    // Clear editing mode
    delete form.dataset.editingPostId;

    // Reset submit button
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = form.dataset.originalSubmitText || '保存';
      submitBtn.style.backgroundColor = '';
    }

    // Remove cancel button
    const cancelBtn = form.querySelector('.btn-cancel-edit');
    if (cancelBtn) cancelBtn.remove();
  } else {
    // CREATE MODE - Add new post
    postData.id = Date.now().toString();
    postData.created_at = new Date().toISOString();
    await DataLayer.createPost(postData);
    alert('文章发布成功！');
  }

  // Reset form
  form.reset();

  // Reload posts on page
  await loadPosts(category);
}

// Load posts using DataLayer
async function loadPosts(category = 'all') {
  const postListContainer = document.querySelector('.post-list');
  if (!postListContainer) return;

  // Clear existing posts first
  postListContainer.innerHTML = '';

  // Load posts using DataLayer (handles both Supabase and localStorage)
  const posts = await DataLayer.getPosts(category);

  if (posts.length === 0) {
    console.log('No posts found for category:', category);
    postListContainer.innerHTML = '<p style="color: #999;">暂无内容</p>';
    return;
  }

  // Display posts
  const postsToShow = category === 'all' ? posts.slice(0, 10) : posts;

  postsToShow.forEach(post => {
    const postElement = createPostElement(post);
    postListContainer.appendChild(postElement);
  });
}

// Create post element HTML
function createPostElement(post) {
  const postItem = document.createElement('div');
  postItem.className = 'post-item';
  postItem.dataset.postId = post.id;

  const dateText = formatDate(post.date);
  const title = post.title || 'Untitled';
  const excerpt = post.excerpt || '';

  // Different rendering based on category
  let contentHTML = '';

  if (post.category === 'links') {
    const url = post.url || '#';
    contentHTML = `
      <p class="post-date">${dateText}</p>
      <div class="link-card">
        <div class="post-content">
          <h3><a href="${url}" target="_blank">${title}</a></h3>
          <p class="post-excerpt">${excerpt}</p>
        </div>
        <div class="link-interactions">
          <button class="interaction-btn like-btn" data-post-id="${post.id}">
            <span class="like-icon">♡</span>
            <span class="like-count">0</span>
          </button>
          <button class="interaction-btn comment-btn" data-post-id="${post.id}">
            <span>💬</span>
            <span class="comment-count">0</span>
          </button>
        </div>
        <div class="link-comment-section" id="comments-${post.id}">
          <div class="link-comment-form">
            <textarea placeholder="写下你的评论..." rows="3"></textarea>
            <input type="text" placeholder="昵称" class="comment-name">
            <input type="text" placeholder="邮箱或网站（选填）" class="comment-contact">
            <button class="btn btn-primary comment-submit-btn" data-post-id="${post.id}">留言</button>
          </div>
          <div class="link-comment-list" id="comment-list-${post.id}"></div>
        </div>
      </div>
    `;
  } else if (post.category === 'reading') {
    const author = post.author ? ` - ${post.author}` : '';
    const rating = post.rating ? ` ⭐️`.repeat(parseInt(post.rating)) : '';
    contentHTML = `
      <p class="post-date">${dateText}</p>
      <div class="post-content">
        <h3>${title}${author}${rating}</h3>
        <p class="post-excerpt">${excerpt}</p>
      </div>
    `;
  } else if (post.category === 'media') {
    const typeEmoji = getMediaTypeEmoji(post.type);
    const rating = post.rating ? ` ⭐️`.repeat(parseInt(post.rating)) : '';
    contentHTML = `
      <p class="post-date">${dateText}</p>
      <div class="post-content">
        <h3>${typeEmoji} ${title}${rating}</h3>
        <p class="post-excerpt">${excerpt}</p>
      </div>
    `;
  } else if (post.category === 'projects') {
    const url = post.url || '#';
    const tech = post.tech ? `<p class="tech-stack"><i>Tech: ${post.tech}</i></p>` : '';
    const titleLink = url !== '#' ? `<a href="${url}" target="_blank">${title}</a>` : title;
    contentHTML = `
      <p class="post-date">${dateText}</p>
      <div class="post-content">
        <h3>${titleLink}</h3>
        <p class="post-excerpt">${excerpt}</p>
        ${tech}
      </div>
    `;
  } else {
    // articles and life - make title clickable
    const articleLink = post.category === 'articles'
      ? `<a href="article-detail.html?id=${post.id}">${title}</a>`
      : title;
    contentHTML = `
      <p class="post-date">${dateText}</p>
      <div class="post-content">
        <h3>${articleLink}</h3>
        <p class="post-excerpt">${excerpt}</p>
      </div>
    `;
  }

  postItem.innerHTML = contentHTML;

  // Add edit/delete buttons if in admin mode
  if (isAdminMode) {
    const adminActions = document.createElement('div');
    adminActions.className = 'post-admin-actions';
    adminActions.innerHTML = `
      <button class="btn btn-small btn-edit" onclick="editPost('${post.id}')">编辑</button>
      <button class="btn btn-small btn-delete" onclick="deletePost('${post.id}', '${post.category}')">删除</button>
    `;
    postItem.appendChild(adminActions);
  }

  return postItem;
}

// Helper function to format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}.${month}`;
}

// Helper function to get media type emoji
function getMediaTypeEmoji(type) {
  const emojiMap = {
    'movie': '🎬',
    'tv': '📺',
    'documentary': '🎥',
    'anime': '🎌'
  };
  return emojiMap[type] || '🎬';
}

// Simple Markdown parser (basic features)
function parseMarkdown(md) {
  if (!md) return '';

  let html = md;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\_(.*?)\_/g, '<em>$1</em>');

  // Images
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto;">');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return html;
}

// Initialize Markdown editors
function initializeMarkdownEditors() {
  const contentTextareas = document.querySelectorAll('textarea[name="content"], textarea[name="excerpt"]');

  contentTextareas.forEach(textarea => {
    // Create preview div
    const previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.style.display = 'none';

    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-secondary markdown-toggle';
    toggleBtn.textContent = 'Preview';
    toggleBtn.style.marginBottom = '0.5em';

    // Insert button and preview
    textarea.parentNode.insertBefore(toggleBtn, textarea);
    textarea.parentNode.insertBefore(previewDiv, textarea.nextSibling);

    // Toggle handler
    toggleBtn.addEventListener('click', function() {
      if (previewDiv.style.display === 'none') {
        // Show preview
        previewDiv.innerHTML = parseMarkdown(textarea.value);
        previewDiv.style.display = 'block';
        textarea.style.display = 'none';
        toggleBtn.textContent = 'Edit';
      } else {
        // Show editor
        previewDiv.style.display = 'none';
        textarea.style.display = 'block';
        toggleBtn.textContent = 'Preview';
      }
    });
  });
}

// Like functionality
function toggleLike(postId) {
  const likesKey = `post_likes_${postId}`;
  const userLikesKey = 'user_liked_posts';

  let likes = parseInt(localStorage.getItem(likesKey) || '0');
  let userLikes = JSON.parse(localStorage.getItem(userLikesKey) || '[]');

  const liked = userLikes.includes(postId);

  if (liked) {
    // Unlike
    likes = Math.max(0, likes - 1);
    userLikes = userLikes.filter(id => id !== postId);
  } else {
    // Like
    likes += 1;
    userLikes.push(postId);
  }

  localStorage.setItem(likesKey, likes.toString());
  localStorage.setItem(userLikesKey, JSON.stringify(userLikes));

  return { likes, liked: !liked };
}

// Get likes for a post
function getLikes(postId) {
  const likesKey = `post_likes_${postId}`;
  const userLikesKey = 'user_liked_posts';

  const likes = parseInt(localStorage.getItem(likesKey) || '0');
  const userLikes = JSON.parse(localStorage.getItem(userLikesKey) || '[]');
  const liked = userLikes.includes(postId);

  return { likes, liked };
}

// Comment functionality
function addComment(postId, commentData) {
  const commentsKey = `post_comments_${postId}`;
  let comments = JSON.parse(localStorage.getItem(commentsKey) || '[]');

  const comment = {
    id: Date.now().toString(),
    postId: postId,
    displayName: commentData.displayName,
    contact: commentData.contact || '',
    content: commentData.content,
    timestamp: new Date().toISOString()
  };

  comments.push(comment);
  localStorage.setItem(commentsKey, JSON.stringify(comments));

  return comment;
}

// Get comments for a post
function getComments(postId) {
  const commentsKey = `post_comments_${postId}`;
  return JSON.parse(localStorage.getItem(commentsKey) || '[]');
}

// Delete post using DataLayer
async function deletePost(postId, category) {
  if (!confirm('确定要删除这篇文章吗？此操作无法撤销。')) {
    return;
  }

  await DataLayer.deletePost(postId, category);
  alert('删除成功！');

  // Reload posts
  await loadPosts(category);
}

// Edit post using DataLayer
async function editPost(postId) {
  // Find the post using DataLayer
  const post = await DataLayer.getPost(postId);
  if (!post) {
    alert('未找到文章');
    return;
  }

  // Find the form on current page
  const form = document.querySelector('.admin-form form');
  if (!form) {
    alert('当前页面没有编辑表单，请前往对应的分类页面进行编辑');
    return;
  }

  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth' });

  // Fill form with post data
  form.querySelector('[name="title"]').value = post.title || '';
  form.querySelector('[name="date"]').value = post.date || '';

  const excerptField = form.querySelector('[name="excerpt"]');
  if (excerptField) excerptField.value = post.excerpt || '';

  const contentField = form.querySelector('[name="content"]');
  if (contentField) contentField.value = post.content || '';

  const urlField = form.querySelector('[name="url"]');
  if (urlField) urlField.value = post.url || '';

  const authorField = form.querySelector('[name="author"]');
  if (authorField) authorField.value = post.author || '';

  const ratingField = form.querySelector('[name="rating"]');
  if (ratingField) ratingField.value = post.rating || '';

  const typeField = form.querySelector('[name="type"]');
  if (typeField) typeField.value = post.type || '';

  const techField = form.querySelector('[name="tech"]');
  if (techField) techField.value = post.tech || '';

  // Store the post ID being edited
  form.dataset.editingPostId = postId;

  // Change submit button text
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = '更新';
    submitBtn.style.backgroundColor = '#ff9800';
  }

  // Add a cancel button if not already there
  let cancelBtn = form.querySelector('.btn-cancel-edit');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary btn-cancel-edit';
    cancelBtn.textContent = '取消编辑';
    cancelBtn.onclick = function() {
      form.reset();
      delete form.dataset.editingPostId;
      submitBtn.textContent = form.dataset.originalSubmitText || '保存';
      submitBtn.style.backgroundColor = '';
      cancelBtn.remove();
    };

    // Store original submit button text
    if (!form.dataset.originalSubmitText) {
      form.dataset.originalSubmitText = submitBtn.textContent;
    }

    submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
  }
}

// Initialize link interactions (likes and comments)
async function initLinkInteractions() {
  // Handle like button clicks
  document.addEventListener('click', async function(e) {
    if (e.target.closest('.like-btn')) {
      const btn = e.target.closest('.like-btn');
      const postId = btn.dataset.postId;

      const result = await DataLayer.toggleLike(postId);
      if (result) {
        const likeIcon = btn.querySelector('.like-icon');
        const likeCount = btn.querySelector('.like-count');

        likeIcon.textContent = result.liked ? '♥' : '♡';
        likeCount.textContent = result.likes;

        if (result.liked) {
          btn.classList.add('liked');
        } else {
          btn.classList.remove('liked');
        }
      }
    }

    // Handle comment button clicks
    if (e.target.closest('.comment-btn')) {
      const btn = e.target.closest('.comment-btn');
      const postId = btn.dataset.postId;
      const commentSection = document.getElementById(`comments-${postId}`);

      if (commentSection) {
        commentSection.classList.toggle('show');
      }
    }

    // Handle comment submit
    if (e.target.closest('.comment-submit-btn')) {
      const btn = e.target.closest('.comment-submit-btn');
      const postId = btn.dataset.postId;
      const commentSection = document.getElementById(`comments-${postId}`);
      const form = commentSection.querySelector('.link-comment-form');

      const content = form.querySelector('textarea').value.trim();
      const displayName = form.querySelector('.comment-name').value.trim();
      const contact = form.querySelector('.comment-contact').value.trim();

      if (!content || !displayName) {
        alert('请填写昵称和评论内容');
        return;
      }

      const commentData = {
        displayName: displayName,
        contact: contact,
        content: content
      };

      const comment = await DataLayer.addComment(postId, commentData);
      if (comment) {
        // Clear form
        form.querySelector('textarea').value = '';
        form.querySelector('.comment-name').value = '';
        form.querySelector('.comment-contact').value = '';

        // Reload comments
        await loadCommentsForPost(postId);

        // Update comment count
        const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
        const comments = await DataLayer.getComments(postId);
        if (commentBtn && comments) {
          commentBtn.querySelector('.comment-count').textContent = comments.length;
        }
      }
    }
  });
}

// Load comments for a specific post
async function loadCommentsForPost(postId) {
  const comments = await DataLayer.getComments(postId);
  const commentList = document.getElementById(`comment-list-${postId}`);

  if (!commentList) return;

  commentList.innerHTML = '';

  if (comments && comments.length > 0) {
    comments.forEach(comment => {
      const commentItem = document.createElement('div');
      commentItem.className = 'link-comment-item';

      const timeAgo = getTimeAgo(comment.timestamp);
      const contactInfo = comment.contact ? ` · ${comment.contact}` : '';

      commentItem.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${comment.display_name || comment.displayName}${contactInfo}</span>
          <span class="comment-time">${timeAgo}</span>
        </div>
        <div class="comment-content">${comment.content}</div>
      `;

      commentList.appendChild(commentItem);
    });
  }
}

// Load likes and comments count for all posts
async function loadLikesAndComments() {
  const linkBtns = document.querySelectorAll('.like-btn');

  for (const btn of linkBtns) {
    const postId = btn.dataset.postId;

    // Load likes
    const likeData = await DataLayer.getLikes(postId);
    if (likeData) {
      const likeIcon = btn.querySelector('.like-icon');
      const likeCount = btn.querySelector('.like-count');

      likeIcon.textContent = likeData.liked ? '♥' : '♡';
      likeCount.textContent = likeData.count || 0;

      if (likeData.liked) {
        btn.classList.add('liked');
      }
    }

    // Load comments
    const comments = await DataLayer.getComments(postId);
    if (comments) {
      const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
      if (commentBtn) {
        commentBtn.querySelector('.comment-count').textContent = comments.length;
      }

      // Load comment list
      await loadCommentsForPost(postId);
    }
  }
}

// Helper function to get relative time
function getTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} 天前`;
  return then.toLocaleDateString('zh-CN');
}

// Load posts when page loads
document.addEventListener('DOMContentLoaded', async function() {
  // Detect current category from page
  const categoryInput = document.querySelector('input[name="category"]');
  if (categoryInput) {
    const category = categoryInput.value;
    await loadPosts(category);

    // Initialize interactions for links
    if (category === 'links') {
      initLinkInteractions();
      await loadLikesAndComments();
    }
  } else {
    // Homepage - load all recent posts
    await loadPosts('all');
  }
});
