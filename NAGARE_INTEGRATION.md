# EmbersM × nagare Stream<T> Integration Plan

**Future Implementation**: @aid-on/embersm → nagare Stream<T> base integration

## 🎯 Overview

Transform EmbersM from static API to streaming-based real-time memory system using nagare's universal Stream<T> interface.

## 🧠 Current EmbersM Architecture

```typescript
// Static API (Non-streaming)
embersm.query(userId, message)    // → Promise<MemoryContext>
embersm.extract(userId, ...)      // → Promise<MemoryUpdates>

// 5-Layer Memory Architecture
- Flash Memory (KV) - Ultra-fast recent context
- Episode Memory (D1) - Full conversation history  
- Semantic Memory (Vectorize) - Vector similarity search
- Temporal Memory (D1) - Time-indexed events
- Graph Memory (D1) - Relationships & reasoning
```

## 🌊 nagare Stream<T> Integration Design

### 1. Real-time Memory Watch Streams

```typescript
import type { Stream } from "@aid-on/nagare";

// Memory change monitoring
embersm.flash.watch(userId)     // → Stream<FlashUpdate>
embersm.episode.watch(userId)   // → Stream<EpisodeUpdate>
embersm.semantic.watch(userId)  // → Stream<SemanticUpdate>
embersm.temporal.watch(userId)  // → Stream<TemporalUpdate>
embersm.graph.watch(userId)     // → Stream<GraphUpdate>

// Unified memory event stream
embersm.memory(userId).watch()  // → Stream<MemoryEvent>

interface MemoryEvent {
  type: "flash" | "episode" | "semantic" | "temporal" | "graph";
  action: "create" | "update" | "delete";
  userId: string;
  data: any;
  timestamp: number;
  metadata?: {
    layer: string;
    confidence?: number;
    relevance?: number;
  };
}
```

### 2. Progressive Query Streaming

```typescript
// Streaming query processing (fast → precise)
embersm.query(userId, message)
  .progressive()               // → Stream<MemoryChunk>
  .pipeThrough(operators.map(chunk => chunk.content))
  .pipeThrough(operators.filter(isRelevant))
  .pipeThrough(operators.throttle(50))

interface MemoryChunk {
  source: "flash" | "episode" | "semantic" | "temporal" | "graph";
  content: string;
  confidence: number;
  timestamp: number;
  metadata: {
    searchTime: number;
    resultCount: number;
    query: string;
  };
}

// Progressive search strategy:
// 1. Flash (0-5ms) → immediate context
// 2. Episode (5-20ms) → recent conversations
// 3. Semantic (20-100ms) → vector search
// 4. Temporal (50-150ms) → time-based events
// 5. Graph (100-300ms) → relationship traversal
```

### 3. Real-time Extraction Progress

```typescript
// Memory extraction with progress streaming
embersm.extract(userId, threadId, userMsg, assistantMsg)
  .withProgress()              // → Stream<ExtractionStep>
  .subscribe(step => updateExtractionUI(step));

interface ExtractionStep {
  step: "parsing" | "episode" | "semantic" | "temporal" | "graph" | "flash" | "complete";
  progress: number; // 0-100
  message: string;
  data?: any;
  timing: {
    elapsed: number;
    estimated: number;
  };
}
```

### 4. Memory Analytics Streaming

```typescript
// Real-time memory statistics
embersm.analytics(userId)
  .stream()                    // → Stream<MemoryStats>
  .pipeThrough(operators.throttle(1000))
  .subscribe(stats => updateMemoryDashboard(stats));

interface MemoryStats {
  userId: string;
  layers: {
    flash: { count: number; size: number; lastUpdate: number };
    episode: { count: number; size: number; searchLatency: number };
    semantic: { count: number; dimensions: number; indexLatency: number };
    temporal: { count: number; timeRange: [number, number] };
    graph: { nodeCount: number; edgeCount: number; traversalDepth: number };
  };
  performance: {
    queryLatency: number;
    extractionLatency: number;
    memoryUsage: number;
  };
  timestamp: number;
}
```

## 🎨 Usage Examples

### Qwik Integration (with @aid-on/qwiks)

```typescript
import { component$, useSignal } from "@builder.io/qwik";
import { useStreamState, operators } from "@aid-on/qwiks";

export default component$(() => {
  const userId = "user123";
  const query = useSignal("");
  
  // Real-time memory watching
  const memoryEvents = embersm.memory(userId).watch()
    .pipeThrough(operators.filter(event => event.action === "create"))
    .pipeThrough(operators.throttle(500));
  
  const memoryState = useStreamState(memoryEvents, []);
  
  // Progressive query streaming
  const handleQuery = $(async (message: string) => {
    const results = embersm.query(userId, message)
      .progressive()
      .pipeThrough(operators.map(chunk => ({
        ...chunk,
        highlighted: highlightKeywords(chunk.content, message)
      })));
    
    const queryState = useStreamState(results, []);
    return queryState;
  });
  
  return (
    <div class="memory-dashboard">
      <h2>Memory System</h2>
      
      {/* Real-time memory updates */}
      <div class="memory-feed">
        {memoryState.items.map(event => (
          <div key={event.timestamp} class={`memory-event ${event.type}`}>
            <span class="layer">{event.type}</span>
            <span class="action">{event.action}</span>
            <span class="content">{JSON.stringify(event.data).slice(0, 100)}</span>
          </div>
        ))}
      </div>
      
      {/* Query interface */}
      <div class="query-interface">
        <input 
          value={query.value}
          onInput$={(e) => query.value = e.target.value}
          placeholder="Ask about memories..."
        />
        <button onClick$={() => handleQuery(query.value)}>
          Search Memories
        </button>
      </div>
    </div>
  );
});
```

### Edge Function Integration

```typescript
// Cloudflare Workers endpoint
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { userId, message } = await request.json();
    
    // Streaming memory query
    return embersm.query(userId, message)
      .progressive()
      .pipeThrough(operators.map(chunk => ({
        timestamp: Date.now(),
        layer: chunk.source,
        content: chunk.content,
        confidence: chunk.confidence,
      })))
      .pipeThrough(operators.throttle(100))
      .toResponse({
        headers: { "Content-Type": "application/json" }
      });
  }
};
```

### Real-time Memory Dashboard

```typescript
// Memory system monitoring
const memoryDashboard = embersm.analytics("user123")
  .stream()
  .pipeThrough(operators.map(stats => ({
    ...stats,
    totalMemories: Object.values(stats.layers).reduce((sum, layer) => sum + layer.count, 0),
    averageLatency: (stats.performance.queryLatency + stats.performance.extractionLatency) / 2,
  })))
  .pipeThrough(operators.throttle(2000));

memoryDashboard.subscribe(stats => {
  updateMetrics("total-memories", stats.totalMemories);
  updateMetrics("avg-latency", stats.averageLatency);
  updateMetrics("memory-usage", stats.performance.memoryUsage);
});
```

## 🏗️ Implementation Strategy

### Phase 1: Memory Event Streams
- [ ] Add `watch()` methods to each memory layer
- [ ] Implement `MemoryEvent` interface
- [ ] Create unified `memory().watch()` stream
- [ ] Add nagare dependency

### Phase 2: Progressive Queries
- [ ] Implement `query().progressive()` streaming
- [ ] Layer-by-layer result emission
- [ ] Confidence scoring for chunks
- [ ] Timing metadata

### Phase 3: Extraction Progress
- [ ] Add `extract().withProgress()` streaming
- [ ] Step-by-step progress reporting
- [ ] Error handling and retry streams
- [ ] Parallel operation monitoring

### Phase 4: Analytics & Monitoring  
- [ ] Implement `analytics().stream()` 
- [ ] Performance metrics streaming
- [ ] Memory usage monitoring
- [ ] Query pattern analysis

## 🎯 Benefits of nagare Integration

### 🚀 **Performance**
- **Incremental Results**: Fast → Precise の段階的表示
- **Real-time Updates**: メモリ変更の即座反映
- **Backpressure**: 大量データの効率的ストリーミング
- **Edge Optimization**: Cloudflare Workers 最適化

### 🔄 **Reactivity**
- **Live Memory**: メモリシステムの状態変化をリアルタイム監視
- **Progressive UX**: 検索結果の段階的表示
- **Error Recovery**: ストリーミングでの障害回復
- **Cancellation**: AbortSignal による適切なキャンセル

### 🌊 **Ecosystem Integration**
```typescript
// Perfect composition with other libraries
const intelligentChat = merge(
  unilmp.groq.instant(key).stream("Response to: " + userMessage),
  embersm.memory(userId).watch(),
  qwiks.sse("/api/context").events()
)
.pipeThrough(operators.map(combineContext))
.pipeThrough(operators.filter(isRelevant))
.toResponse();
```

## 📊 Expected API Design

### Core Memory Streaming

```typescript
import { embersm } from "@aid-on/embersm";
import { operators } from "@aid-on/nagare";

// Memory layer watching
const flashUpdates = embersm.flash.watch(userId);
const episodeUpdates = embersm.episode.watch(userId);
const semanticUpdates = embersm.semantic.watch(userId);

// Unified memory stream
const allMemoryEvents = embersm.memory(userId).watch()
  .pipeThrough(operators.filter(event => event.action === "create"))
  .pipeThrough(operators.map(event => ({
    ...event,
    displayText: formatForUI(event.data)
  })));

// Progressive query
const queryResults = embersm.query(userId, "What did I work on yesterday?")
  .progressive()
  .pipeThrough(operators.map(chunk => ({
    layer: chunk.source,
    relevance: chunk.confidence,
    text: chunk.content,
    timing: chunk.metadata.searchTime
  })))
  .pipeThrough(operators.throttle(100));
```

### Qwik Components

```typescript
// Memory-aware chat component
export const MemoryChat = component$(() => {
  const memoryStream = embersm.memory(userId).watch();
  const queryStream = embersm.query(userId, currentQuery).progressive();
  
  const memoryState = useStreamArray(memoryStream);
  const queryState = useStreamArray(queryStream);
  
  return (
    <div>
      <MemoryFeed events={memoryState.items} />
      <QueryResults results={queryState.items} />
      <ChatInterface 
        onMessage={(msg) => processWithMemory(msg)}
      />
    </div>
  );
});
```

## 🗓️ Timeline

- **Q1 2025**: Memory Watch Streams implementation
- **Q2 2025**: Progressive Query Streaming
- **Q3 2025**: Real-time Extraction Progress
- **Q4 2025**: Analytics & Monitoring Streams

## 🔗 Dependencies

```json
{
  "dependencies": {
    "@aid-on/nagare": "^0.1.0"
  }
}
```

---

**Future Implementation**: Transform EmbersM into a real-time, streaming-aware memory system with nagare Stream<T> foundation for next-generation AI applications. 🧠🌊