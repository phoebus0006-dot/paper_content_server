# Admin API Contract

## 1. GET /api/admin/access-mode
- **Method:** GET
- **Path:** `/api/admin/access-mode`
- **Response:**
  ```json
  {
    "mode": "lan"
  }
  ```

## 2. GET /api/admin/dashboard
- **Method:** GET
- **Path:** `/api/admin/dashboard`
- **Response:**
  ```json
  {
    "status": "ok",
    "mode": "auto",
    "description": "自动生成与排程模式",
    "source": "scheduler",
    "newsCount": 5,
    "photoCount": 3,
    "lastRefresh": "2026-07-15T14:40:00Z"
  }
  ```

## 3. GET /api/admin/control-mode
- **Method:** GET
- **Path:** `/api/admin/control-mode`
- **Response:**
  ```json
  {
    "status": "ok",
    "mode": "auto",
    "description": "自动排程模式",
    "source": "scheduler"
  }
  ```

## 4. GET /api/admin/news
- **Method:** GET
- **Path:** `/api/admin/news`
- **Response:**
  ```json
  {
    "selected": [
      { "id": "n1", "zhTitle": "新闻标题 1", "zhSummary": "内容摘要 1" }
    ],
    "newsItemCount": 1
  }
  ```

## 5. GET /api/admin/photos
- **Method:** GET
- **Path:** `/api/admin/photos`
- **Response:**
  ```json
  {
    "photos": [
      { "id": "p1", "title": "图片标题 1", "width": 800, "height": 480, "createdAt": "2026-07-15T14:40:00Z" }
    ]
  }
  ```

## 6. GET /api/admin/publish-history
- **Method:** GET
- **Path:** `/api/admin/publish-history`
- **Response:**
  ```json
  {
    "history": []
  }
  ```
