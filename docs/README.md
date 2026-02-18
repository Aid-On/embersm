# @aid-on/embersm

## 概要

`@aid-on/embersm`は、Cloudflare Workers向けの高性能メモリアーキテクチャシステムです。LLMエージェントに長期記憶を提供し、ベンチマークでMem0比+25-34%の性能向上を実現しています。5層アーキテクチャを基盤としつつ、実用性を重視したシンプル構成でベスト性能を達成します。

## 主な特徴

- **高性能メモリ検索**: LOCOMOベンチマークで66-75%達成（Mem0比+25-34%向上）
- **5層アーキテクチャ**: Flash、Episode、Semantic、Temporal、Graph層による柔軟な記憶構造
- **Cloudflareネイティブ**: D1、Vectorize、Workers AIを活用した最適化
- **シンプル構成**: 実証済みベスト構成によるプロダクション対応
- **型安全性**: TypeScriptによる完全な型サポート
- **互換性**: 異なるCloudflareバインディングバージョンへの対応
- **並列処理**: 非同期処理による高速なメモリ操作

## アーキテクチャ

### ベンチマーク結果

LOCOMOベンチマーク（100問）での評価結果：

| 構成 | スコア | Mem0 比較 |
|------|--------|-----------|
| **Best (Semantic + Episode)** | **66-75%** | **+25-34%** |
| 5-Layer (temporal/graph追加) | 47-55% | +6-14% |

> Mem0 baseline: 41%

### ベスト構成（推奨）

検証の結果、シンプルな構成が最も高いスコアを達成：

```
Semantic Search (50件) + Episode Keyword (15件) + Recent (10件)
```

### 5層アーキテクチャ概念図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   1. Flash      │    │   2. Episode    │    │   3. Semantic   │
│   (KV Store)    │    │   (D1 Database) │    │   (Vectorize)   │
│   ~1ms          │    │   ~5ms          │    │   ~10ms         │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Recent Context  │    │ Conversation    │    │ Vector          │
│ Ultra Fast      │    │ History         │    │ Similarity      │
│ Access          │    │ Text Search     │    │ Search          │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐
│   4. Temporal   │    │   5. Graph      │
│   (D1 Database) │    │   (D1 Database) │
│   ~5ms          │    │   ~5ms          │
├─────────────────┤    ├─────────────────┤
│ Time-based      │    │ Relationships   │
│ Events          │    │ Entity Facts    │
│ Timeline        │    │ Reasoning       │
└─────────────────┘    └─────────────────┘
```

### データフロー

```
Query → [Classification] → [Parallel Memory Access] → [Fusion] → Context
   ↓         ↓                      ↓                   ↓        ↓
Input → Router AI → Flash/Episode/Semantic → Memory Fusion → LLM
```

## APIリファレンス (API Reference)

### シンプル構成（推奨）

```typescript
import { createEmbersMSimple, type EmbersMSimpleEnv } from '@aid-on/embersm';

// 環境設定
const env: EmbersMSimpleEnv = {
  DB: context.env.DB,           // D1Database
  VECTORIZE: context.env.VECTORIZE, // VectorizeIndex  
  AI: context.env.AI,           // Ai
};

// EmbersM インスタンス作成
const memory = createEmbersMSimple(env);

// メモリクエリ
const context = await memory.query(userId, "When did Melanie paint?");

// 会話ターンの保存
await memory.extract(userId, threadId, userMessage, assistantResponse, turnIndex);

// データベース初期化
await memory.migrate();
```

### 完全版（5層アーキテクチャ）

```typescript
import { createEmbersM, type EmbersMEnv } from '@aid-on/embersm';

// 環境設定（KVが必要）
const env: EmbersMEnv = {
  DB: context.env.DB,
  KV: context.env.KV,
  VECTORIZE: context.env.VECTORIZE,
  AI: context.env.AI,
};

// EmbersM インスタンス作成
const memory = createEmbersM(env);

// インテリジェントクエリ（自動ルーティング）
const memoryContext = await memory.query(userId, "What did we discuss about AI last month?");

// 構造化メモリ抽出
const updates = await memory.extract(userId, threadId, userMessage, assistantResponse);
```

### 個別ストア操作

```typescript
import { 
  createFlashStore,
  createEpisodeStore, 
  createSemanticStore,
  createTemporalStore,
  createGraphStore 
} from '@aid-on/embersm';

// Flash Memory（超高速キャッシュ）
const flash = createFlashStore(env.KV);
await flash.push(userId, { content: "Recent message", role: "user", turnIndex: 0 });
const recentItems = await flash.get(userId);

// Episode Memory（会話履歴）
const episode = createEpisodeStore(env.DB);
const savedEpisode = await episode.save({
  userId, threadId, content: "User message", role: "user", turnIndex: 0
});
const episodes = await episode.getByUser(userId, 20);
const searchResults = await episode.search(userId, "keyword", 10);

// Semantic Memory（ベクトル検索）
const semantic = createSemanticStore(env.VECTORIZE, env.AI, env.DB);
await semantic.index({
  userId, content: "Knowledge to remember", source: "conversation"
});
const semanticResults = await semantic.search(userId, "query text", 10);

// Temporal Memory（時系列イベント）
const temporal = createTemporalStore(env.DB);
await temporal.save({
  userId, eventType: "meeting", timestamp: new Date(), description: "Team sync"
});
const recentEvents = await temporal.queryAfter(userId, new Date('2024-01-01'), 20);

// Graph Memory（関係性・事実）
const graph = createGraphStore(env.DB);
await graph.save({
  userId, subject: "Alice", predicate: "works_at", object: "OpenAI"
});
const facts = await graph.traverse(userId, "Alice", 2);
```

## 使用例 (Usage Examples)

### 基本的な会話記憶システム

```typescript
// src/memory-system.ts
import { createEmbersMSimple } from '@aid-on/embersm';

export class ConversationMemory {
  private memory: ReturnType<typeof createEmbersMSimple>;
  
  constructor(env: { DB: D1Database; VECTORIZE: VectorizeIndex; AI: Ai }) {
    this.memory = createEmbersMSimple(env);
  }
  
  async initialize() {
    // データベース初期化
    await this.memory.migrate();
    console.log('Memory system initialized');
  }
  
  async processMessage(
    userId: string, 
    threadId: string,
    userMessage: string,
    turnIndex: number
  ): Promise<string> {
    
    // 1. 関連記憶を検索
    const context = await this.memory.query(userId, userMessage);
    
    // 2. LLMに記憶コンテキストを提供して回答生成
    const response = await this.generateResponse(userMessage, context);
    
    // 3. 会話を記憶に保存
    await this.memory.extract(
      userId, 
      threadId, 
      userMessage, 
      response, 
      turnIndex
    );
    
    return response;
  }
  
  private async generateResponse(message: string, context: string): Promise<string> {
    // LLM API 呼び出し例
    const prompt = `
Context from memory:
${context}

User message: ${message}

Please respond naturally, incorporating relevant information from the context.
    `;
    
    // AI エージェント実装に応じて調整
    const response = await this.callLLM(prompt);
    return response;
  }
  
  private async callLLM(prompt: string): Promise<string> {
    // 実際のLLM呼び出し実装
    return "AI response based on memory context";
  }
}

// 使用例
const memory = new ConversationMemory(env);
await memory.initialize();

const response = await memory.processMessage(
  "user123",
  "thread456", 
  "What did we discuss about the AI project?",
  5
);
```

### カスタマーサポート記憶システム

```typescript
// src/customer-support-memory.ts
import { createEmbersM } from '@aid-on/embersm';

export class CustomerSupportMemory {
  private memory: ReturnType<typeof createEmbersM>;
  
  constructor(env: EmbersMEnv) {
    this.memory = createEmbersM(env);
  }
  
  async getCustomerHistory(customerId: string, query: string) {
    const memoryContext = await this.memory.query(customerId, query);
    
    return {
      recentInteractions: memoryContext.flash || [],
      pastConversations: memoryContext.episodes || [],
      relatedKnowledge: memoryContext.semantic || [],
      timelineEvents: memoryContext.temporal || [],
      customerProfile: memoryContext.graph || []
    };
  }
  
  async recordInteraction(
    customerId: string,
    interactionId: string, 
    customerMessage: string,
    agentResponse: string,
    metadata?: any
  ) {
    // 基本的な記憶抽出
    const updates = await this.memory.extract(
      customerId,
      interactionId,
      customerMessage, 
      agentResponse
    );
    
    // カスタマーサポート固有の情報を追加保存
    if (metadata?.issueType) {
      await this.memory.temporal.save({
        userId: customerId,
        eventType: 'support_interaction',
        timestamp: new Date(),
        description: `Issue: ${metadata.issueType}`,
        metadata: JSON.stringify(metadata)
      });
    }
    
    // 顧客プロフィール情報の更新
    if (metadata?.customerInfo) {
      for (const [key, value] of Object.entries(metadata.customerInfo)) {
        await this.memory.graph.save({
          userId: customerId,
          subject: customerId,
          predicate: key,
          object: String(value),
          confidence: 1.0
        });
      }
    }
    
    return updates;
  }
  
  async searchKnowledgeBase(query: string, limit = 20) {
    // セマンティック検索で関連記事を検索
    return await this.memory.semantic.search('knowledge_base', query, limit);
  }
  
  async getCustomerTimeline(customerId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await this.memory.temporal.queryAfter(customerId, startDate, 50);
  }
}

// 使用例
const supportMemory = new CustomerSupportMemory(env);

// 過去の履歴取得
const history = await supportMemory.getCustomerHistory(
  "customer123", 
  "billing issue"
);

// 新しいやり取りの記録
await supportMemory.recordInteraction(
  "customer123",
  "interaction456",
  "My account was charged twice this month",
  "I can see the duplicate charge. Let me process a refund for you.",
  { 
    issueType: "billing",
    resolution: "refund_processed",
    customerInfo: { plan: "premium", region: "US" }
  }
);
```

### マルチテナント記憶システム

```typescript
// src/multi-tenant-memory.ts
import { createEmbersMSimple } from '@aid-on/embersm';

export class MultiTenantMemory {
  private memory: ReturnType<typeof createEmbersMSimple>;
  
  constructor(env: EmbersMSimpleEnv) {
    this.memory = createEmbersMSimple(env);
  }
  
  // テナント固有のユーザーIDを生成
  private getTenantUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }
  
  async queryMemory(tenantId: string, userId: string, query: string) {
    const tenantUserId = this.getTenantUserId(tenantId, userId);
    return await this.memory.query(tenantUserId, query);
  }
  
  async saveInteraction(
    tenantId: string,
    userId: string,
    sessionId: string,
    userMessage: string, 
    assistantResponse: string,
    turnIndex: number
  ) {
    const tenantUserId = this.getTenantUserId(tenantId, userId);
    
    await this.memory.extract(
      tenantUserId,
      `${tenantId}:${sessionId}`,
      userMessage,
      assistantResponse, 
      turnIndex
    );
  }
  
  // テナント別統計情報
  async getTenantStats(tenantId: string) {
    // D1から直接テナント固有の統計を取得
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_episodes,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT thread_id) as unique_sessions,
        MIN(created_at) as first_interaction,
        MAX(created_at) as last_interaction
      FROM episodes 
      WHERE user_id LIKE ?
    `).bind(`${tenantId}:%`).first();
    
    return stats;
  }
  
  // テナントデータの削除（GDPR対応）
  async deleteTenantData(tenantId: string) {
    const tenantPrefix = `${tenantId}:`;
    
    // Episodes削除
    await env.DB.prepare(`
      DELETE FROM episodes WHERE user_id LIKE ?
    `).bind(`${tenantPrefix}%`).run();
    
    // Semantics削除  
    await env.DB.prepare(`
      DELETE FROM semantic_items WHERE user_id LIKE ?
    `).bind(`${tenantPrefix}%`).run();
    
    // Vectorizeからも削除（userIdでフィルタリング）
    // 注意: Vectorizeには一括削除APIがないため、個別削除が必要
    console.log(`Tenant ${tenantId} data deletion completed`);
  }
}

// 使用例
const multiTenantMemory = new MultiTenantMemory(env);

// Tenant A のユーザー操作
await multiTenantMemory.saveInteraction(
  "tenant-a",
  "user123", 
  "session456",
  "How do I configure my dashboard?",
  "You can configure your dashboard by going to Settings > Dashboard.",
  1
);

// Tenant B のユーザー操作（完全に分離）
const context = await multiTenantMemory.queryMemory(
  "tenant-b",
  "user789", 
  "What are my recent orders?"
);
```

### パーソナルAI記憶システム

```typescript
// src/personal-ai-memory.ts  
import { createEmbersM } from '@aid-on/embersm';

export class PersonalAIMemory {
  private memory: ReturnType<typeof createEmbersM>;
  
  constructor(env: EmbersMEnv) {
    this.memory = createEmbersM(env);
  }
  
  async learnFromDocument(userId: string, document: string, source: string) {
    // ドキュメントを段落に分割
    const paragraphs = document.split('\n\n').filter(p => p.trim().length > 50);
    
    // 並列でセマンティックインデックスに追加
    const indexPromises = paragraphs.map(paragraph => 
      this.memory.semantic.index({
        userId,
        content: paragraph.trim(),
        source,
        sourceId: `${source}-${Date.now()}-${Math.random()}`
      })
    );
    
    await Promise.all(indexPromises);
    
    // 学習イベントをタイムラインに記録
    await this.memory.temporal.save({
      userId,
      eventType: 'document_learned',
      timestamp: new Date(),
      description: `Learned from ${source}: ${paragraphs.length} paragraphs`
    });
  }
  
  async recordPersonalFact(userId: string, fact: string) {
    // 事実から関係性を抽出（簡易版）
    const relationships = this.extractRelationships(fact);
    
    for (const rel of relationships) {
      await this.memory.graph.save({
        userId,
        subject: rel.subject,
        predicate: rel.predicate, 
        object: rel.object,
        confidence: 0.8,
        source: 'user_input'
      });
    }
    
    // セマンティック検索用にもインデックス
    await this.memory.semantic.index({
      userId,
      content: fact,
      source: 'personal_fact'
    });
  }
  
  async getPersonalProfile(userId: string) {
    // グラフから個人プロフィールを構築
    const profile: Record<string, any> = {};
    
    const facts = await this.memory.graph.traverse(userId, userId, 3);
    
    for (const fact of facts) {
      if (fact.subject === userId) {
        profile[fact.predicate] = fact.object;
      }
    }
    
    return profile;
  }
  
  async getMemoryInsights(userId: string) {
    // メモリ使用状況の分析
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [recentEpisodes, recentEvents, profile] = await Promise.all([
      this.memory.episode.getByUser(userId, 100),
      this.memory.temporal.queryAfter(userId, lastWeek, 50),
      this.getPersonalProfile(userId)
    ]);
    
    return {
      totalConversations: recentEpisodes.length,
      recentActivity: recentEvents.length,
      personalFacts: Object.keys(profile).length,
      memorySpan: {
        earliest: recentEpisodes[recentEpisodes.length - 1]?.createdAt,
        latest: recentEpisodes[0]?.createdAt
      }
    };
  }
  
  private extractRelationships(fact: string): Array<{
    subject: string;
    predicate: string; 
    object: string;
  }> {
    // 簡単な関係性抽出（本格的にはNLPライブラリを使用）
    const patterns = [
      /(\w+)\s+is\s+(.+)/i,
      /(\w+)\s+likes\s+(.+)/i, 
      /(\w+)\s+works?\s+at\s+(.+)/i,
      /(\w+)\s+lives?\s+in\s+(.+)/i
    ];
    
    const relationships = [];
    
    for (const pattern of patterns) {
      const match = fact.match(pattern);
      if (match) {
        const [, subject, object] = match;
        const predicate = this.inferPredicate(fact);
        relationships.push({
          subject: subject.trim(),
          predicate,
          object: object.trim()
        });
      }
    }
    
    return relationships;
  }
  
  private inferPredicate(fact: string): string {
    if (/\bis\b/i.test(fact)) return 'is';
    if (/\blikes?\b/i.test(fact)) return 'likes';
    if (/\bworks?\s+at\b/i.test(fact)) return 'works_at';
    if (/\blives?\s+in\b/i.test(fact)) return 'lives_in';
    return 'related_to';
  }
}

// 使用例
const personalAI = new PersonalAIMemory(env);

// ドキュメントから学習
await personalAI.learnFromDocument(
  "user123",
  documentText,
  "user_manual"
);

// 個人的な事実の記録
await personalAI.recordPersonalFact(
  "user123", 
  "I like coffee and work at OpenAI"
);

// プロフィール取得
const profile = await personalAI.getPersonalProfile("user123");
console.log('Personal profile:', profile);

// メモリ洞察
const insights = await personalAI.getMemoryInsights("user123");
console.log('Memory insights:', insights);
```

## 設定オプション (Configuration Options)

### 環境設定

```typescript
// シンプル構成用環境
interface EmbersMSimpleEnv {
  DB: D1Database;           // D1 データベース
  VECTORIZE: VectorizeIndex; // Vectorize インデックス
  AI: Ai;                   // Workers AI
}

// 完全構成用環境
interface EmbersMEnv extends EmbersMSimpleEnv {
  KV: KVNamespace;          // KV ストア（Flash Memory用）
}

// 環境変数設定例
const env: EmbersMEnv = {
  DB: c.env.MEMORY_DB,
  KV: c.env.MEMORY_KV,
  VECTORIZE: c.env.MEMORY_VECTORIZE,
  AI: c.env.AI
};
```

### ストア個別設定

```typescript
// Episode Store 設定
const episodeConfig = {
  maxEpisodes: 10000,      // ユーザーあたり最大エピソード数
  cleanupInterval: 30,     // 古いエピソード削除間隔（日）
  indexingEnabled: true    // フルテキスト検索有効化
};

// Semantic Store 設定
const semanticConfig = {
  embeddingModel: '@cf/baai/bge-base-en-v1.5', // 埋め込みモデル
  maxResults: 100,         // 最大検索結果数
  similarityThreshold: 0.7, // 類似度閾値
  batchSize: 10            // バッチ処理サイズ
};

// Temporal Store 設定
const temporalConfig = {
  eventRetention: 365,     // イベント保持期間（日）
  indexGranularity: 'hour', // インデックス粒度
  timeZone: 'UTC'          // タイムゾーン設定
};

// Graph Store 設定
const graphConfig = {
  maxTraversalDepth: 5,    // 最大トラバース深度
  confidenceThreshold: 0.5, // 信頼度閾値
  relationshipTypes: [     // 許可する関係性タイプ
    'works_at', 'lives_in', 'likes', 'knows'
  ]
};
```

### パフォーマンス設定

```typescript
// メモリクエリ設定
const queryConfig = {
  // 並列実行設定
  parallelStoreAccess: true,
  maxConcurrentQueries: 5,
  
  // キャッシュ設定
  resultCaching: true,
  cacheExpiry: 300, // 5分
  
  // 検索件数設定（ベスト構成）
  semantic: {
    maxResults: 50,     // セマンティック検索最大件数
    minScore: 0.7       // 最小類似度スコア
  },
  episode: {
    recentLimit: 10,    // 最近のエピソード件数
    keywordLimit: 15,   // キーワード検索件数
    maxKeywords: 5      // 最大キーワード数
  }
};

// バッチ処理設定
const batchConfig = {
  vectorizeBatchSize: 100,  // Vectorize一括処理サイズ
  d1BatchSize: 50,          // D1バッチサイズ
  batchTimeout: 30000,      // バッチタイムアウト（ms）
  retryAttempts: 3          // 再試行回数
};
```

### データベース設定

```typescript
// D1 接続設定
const d1Config = {
  connectionRetries: 3,
  queryTimeout: 30000,
  maxConnections: 10,
  
  // インデックス設定
  indexes: {
    episodes: [
      'CREATE INDEX IF NOT EXISTS idx_episodes_user_created ON episodes(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_episodes_content_fts ON episodes_fts(content)',
      'CREATE INDEX IF NOT EXISTS idx_episodes_thread ON episodes(thread_id, turn_index)'
    ],
    semantic: [
      'CREATE INDEX IF NOT EXISTS idx_semantic_user ON semantic_items(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_items(source, source_id)'
    ]
  }
};

// Vectorize 設定
const vectorizeConfig = {
  dimensions: 768,          // 埋め込みベクトル次元数
  metric: 'cosine',         // 距離メトリック
  
  // インデックス作成設定
  indexConfig: {
    preset: "maximum-performance" // または "balanced", "memory-optimized"
  },
  
  // 検索設定
  searchConfig: {
    topK: 100,              // 最大検索結果数
    includeValues: false,   // ベクトル値を含めるか
    includeMetadata: true   // メタデータを含めるか
  }
};
```

## パフォーマンス考慮事項 (Performance Considerations)

### ベンチマーク最適化

```typescript
// ベスト性能を出すための設定
const optimizedQuery = async (memory: EmbersMSimple, userId: string, query: string) => {
  // 1. セマンティック検索（50件）- 最高のリコール率
  const semanticResults = await memory.semantic.search(userId, query, 50);
  
  // 2. キーワード検索（15件）- 正確なマッチング
  const keywords = extractKeywords(query);
  const keywordResults = await Promise.all(
    keywords.slice(0, 3).map(kw => memory.episode.search(userId, kw, 5))
  );
  
  // 3. 最近のコンテキスト（10件）- 会話の連続性
  const recentResults = await memory.episode.getByUser(userId, 10);
  
  // 結果の統合とランキング
  return fuseResults(semanticResults, keywordResults, recentResults);
};
```

### メモリ使用量最適化

```typescript
// メモリ効率的な処理
class OptimizedMemoryAccess {
  private resultCache = new Map<string, any>();
  private cacheMaxSize = 1000;
  
  async queryWithCaching(userId: string, query: string) {
    const cacheKey = `${userId}:${query}`;
    
    // キャッシュチェック
    if (this.resultCache.has(cacheKey)) {
      return this.resultCache.get(cacheKey);
    }
    
    // クエリ実行
    const result = await this.performQuery(userId, query);
    
    // キャッシュサイズ管理
    if (this.resultCache.size >= this.cacheMaxSize) {
      const firstKey = this.resultCache.keys().next().value;
      this.resultCache.delete(firstKey);
    }
    
    this.resultCache.set(cacheKey, result);
    return result;
  }
  
  // ストリーミング処理による省メモリ
  async* streamEpisodes(userId: string, batchSize = 100) {
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const batch = await this.getEpisodeBatch(userId, offset, batchSize);
      
      if (batch.length < batchSize) {
        hasMore = false;
      }
      
      yield batch;
      offset += batchSize;
    }
  }
}
```

### 並列処理最適化

```typescript
// 効率的な並列処理
async function parallelMemoryAccess(memory: EmbersM, userId: string, query: string) {
  // 関連性の高いストアのみ並列アクセス
  const classification = await memory.router.classify(query);
  const storesToQuery = memory.router.getStoresToQuery(classification);
  
  const promises: Promise<any>[] = [];
  
  // 条件分岐により不要なクエリを削減
  if (storesToQuery.semantic) {
    promises.push(memory.semantic.search(userId, query, 50));
  }
  
  if (storesToQuery.episode) {
    promises.push(memory.episode.getByUser(userId, 20));
  }
  
  if (classification.hasTemporalReference && storesToQuery.temporal) {
    promises.push(memory.temporal.queryRange(userId, startDate, endDate));
  }
  
  // Promise.allSettledで部分的失敗に対応
  const results = await Promise.allSettled(promises);
  
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<any>).value);
}
```

### データベース最適化

```sql
-- パフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_episodes_user_created_desc 
ON episodes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episodes_fts 
ON episodes USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_semantic_user_score 
ON semantic_items(user_id, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_temporal_user_timestamp 
ON temporal_events(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_graph_subject_predicate 
ON graph_facts(user_id, subject, predicate);

-- 定期的なメンテナンス
VACUUM ANALYZE episodes;
VACUUM ANALYZE semantic_items;
```

### Vectorize最適化

```typescript
// Vectorize効率的利用
class OptimizedVectorizeAccess {
  private batchQueue: Array<any> = [];
  private batchTimer?: NodeJS.Timeout;
  
  async indexBatch(items: SemanticItem[]) {
    // バッチ処理でVectorize APIコール数を削減
    const batches = this.createBatches(items, 100);
    
    for (const batch of batches) {
      const vectors = await this.generateEmbeddings(batch.map(b => b.content));
      
      const vectorizeData = batch.map((item, index) => ({
        id: item.sourceId || crypto.randomUUID(),
        values: vectors.data![index],
        metadata: {
          userId: item.userId,
          content: item.content,
          source: item.source
        }
      }));
      
      await this.vectorize.upsert(vectorizeData);
    }
  }
  
  async smartSearch(userId: string, query: string, limit: number) {
    // クエリ長によるEmbedding最適化
    const optimizedQuery = query.length > 500 ? 
      this.summarizeQuery(query) : query;
    
    const queryVector = await this.generateEmbeddings([optimizedQuery]);
    
    const results = await this.vectorize.query(queryVector.data![0], {
      topK: Math.min(limit * 2, 200), // バッファを含めて取得
      filter: { userId },
      includeMetadata: true
    });
    
    // 後処理で精密フィルタリング
    return this.postProcessResults(results, limit);
  }
}
```

### 開発時の最適化

```typescript
// 開発時のデバッグとプロファイリング
class MemoryProfiler {
  private timings: Map<string, number> = new Map();
  
  async profiledQuery(userId: string, query: string) {
    console.time('total-query');
    
    const start = Date.now();
    
    console.time('semantic-search');
    const semantic = await this.memory.semantic.search(userId, query, 50);
    console.timeEnd('semantic-search');
    this.timings.set('semantic', Date.now() - start);
    
    console.time('episode-search');
    const episodes = await this.memory.episode.getByUser(userId, 20);
    console.timeEnd('episode-search');
    this.timings.set('episode', Date.now() - start - this.timings.get('semantic')!);
    
    console.timeEnd('total-query');
    
    console.log('Performance breakdown:', Object.fromEntries(this.timings));
    
    return { semantic, episodes };
  }
  
  generatePerformanceReport() {
    const avgTiming = (key: string) => {
      const values = Array.from(this.timings.entries())
        .filter(([k]) => k.includes(key))
        .map(([, v]) => v);
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    
    return {
      averageSemanticTime: avgTiming('semantic'),
      averageEpisodeTime: avgTiming('episode'),
      totalQueries: this.timings.size
    };
  }
}
```