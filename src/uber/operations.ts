/**
 * Operation catalog for Uber Eats web API.
 *
 * Each operation is a plain JSON POST to /_p/api/<name>. No persisted queries,
 * no hashes. Response envelope is always { status: "success" | "failure", data }.
 *
 * Shapes below are verified from recon/captured.har (2026-04-11). If Uber
 * changes a shape, the corresponding parser will throw and the tool will
 * surface GRAPHQL_ERROR to the agent.
 */

export interface OperationDef<Vars, Resp> {
  name: string;
  buildBody: (args: Vars) => Record<string, unknown>;
  parseData: (data: unknown) => Resp;
}

// =========================================================================
// getPastOrdersV1 — order history
// =========================================================================

export interface PastOrder {
  orderUuid: string;
  storeUuid: string;
  restaurantName: string;
  completedAt: string;
  totalCents: number;
  isCancelled: boolean;
  isCompleted: boolean;
  /** The items array in the exact shape createDraftOrderV2 wants. */
  shoppingCartItems: ShoppingCartItem[];
}

export interface ShoppingCartItem {
  uuid: string;
  storeUuid: string;
  shoppingCartItemUuid: string;
  sectionUuid: string;
  subsectionUuid: string;
  title: string;
  price: number;
  quantity: number;
  specialInstructions: string;
  itemQuantity: unknown;
  customizations: Record<string, unknown>;
}

export const GetPastOrders: OperationDef<void, { orders: PastOrder[] }> = {
  name: 'getPastOrdersV1',
  buildBody: () => ({ lastWorkflowUUID: '' }),
  parseData: (data) => {
    const d = data as { ordersMap?: Record<string, RawPastOrder> };
    if (!d.ordersMap) throw new Error('getPastOrdersV1: missing ordersMap');
    const orders: PastOrder[] = [];
    for (const raw of Object.values(d.ordersMap)) {
      const base = raw.baseEaterOrder;
      if (!base) continue;
      orders.push({
        orderUuid: base.uuid,
        storeUuid: base.storeUuid,
        restaurantName: base.storeInfo?.title ?? raw.storeInfo?.title ?? '(unknown)',
        completedAt: base.completedAt ?? base.lastStateChangeAt ?? '',
        totalCents: base.totalCents ?? 0,
        isCancelled: base.isCancelled ?? false,
        isCompleted: base.isCompleted ?? false,
        shoppingCartItems: (base.shoppingCart?.items ?? []).map((i) => ({
          uuid: i.uuid,
          storeUuid: i.storeUuid,
          shoppingCartItemUuid: i.shoppingCartItemUuid,
          sectionUuid: i.sectionUuid,
          subsectionUuid: i.subsectionUuid,
          title: i.title,
          price: i.price,
          quantity: i.quantity,
          specialInstructions: i.specialInstructions ?? '',
          itemQuantity: i.itemQuantity ?? null,
          customizations: i.customizations ?? {},
        })),
      });
    }
    // Sort newest first by completedAt.
    orders.sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1));
    return { orders };
  },
};

interface RawPastOrder {
  baseEaterOrder?: {
    uuid: string;
    storeUuid: string;
    completedAt?: string;
    lastStateChangeAt?: string;
    isCancelled?: boolean;
    isCompleted?: boolean;
    totalCents?: number;
    storeInfo?: { title?: string };
    shoppingCart?: { items?: RawCartItem[] };
  };
  storeInfo?: { title?: string };
}

interface RawCartItem {
  uuid: string;
  storeUuid: string;
  shoppingCartItemUuid: string;
  sectionUuid: string;
  subsectionUuid: string;
  title: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
  itemQuantity?: unknown;
  customizations?: Record<string, unknown>;
}

// =========================================================================
// getStoreV1 — restaurant menu
// =========================================================================

export interface StoreMenu {
  uuid: string;
  name: string;
  citySlug: string;
  sections: MenuSection[];
}

export interface MenuSection { uuid: string; name: string; items: MenuItem[]; }
export interface MenuItem { uuid: string; name: string; priceCents: number; description: string; }

export const GetStore: OperationDef<{ storeUuid: string }, StoreMenu> = {
  name: 'getStoreV1',
  buildBody: ({ storeUuid }) => ({
    storeUuid,
    diningMode: 'DELIVERY',
    time: { asap: true },
    cbType: 'EATER_ENDORSED',
  }),
  parseData: (data) => {
    const d = data as RawStore;
    if (!d.uuid || !d.title) throw new Error('getStoreV1: missing uuid/title');
    const sections: MenuSection[] = [];
    const sectionsById = d.sectionsMap ?? {};
    const itemsById = d.itemsMap ?? {};
    for (const s of Object.values(sectionsById)) {
      sections.push({
        uuid: s.uuid,
        name: s.title ?? '',
        items: (s.subsectionUuids ?? [])
          .flatMap((subUuid) => (d.subsectionsMap?.[subUuid]?.itemUuids ?? []))
          .map((itemUuid) => itemsById[itemUuid])
          .filter((i): i is RawStoreItem => !!i)
          .map((i) => ({
            uuid: i.uuid,
            name: i.title,
            priceCents: i.price ?? 0,
            description: i.itemDescription ?? '',
          })),
      });
    }
    return { uuid: d.uuid, name: d.title, citySlug: d.citySlug ?? '', sections };
  },
};

interface RawStore {
  uuid?: string;
  title?: string;
  citySlug?: string;
  sectionsMap?: Record<string, { uuid: string; title?: string; subsectionUuids?: string[] }>;
  subsectionsMap?: Record<string, { itemUuids?: string[] }>;
  itemsMap?: Record<string, RawStoreItem>;
}
interface RawStoreItem { uuid: string; title: string; price?: number; itemDescription?: string; }

// =========================================================================
// getSearchFeedV1 — full search results
// =========================================================================

export interface SearchResult {
  places: SearchPlace[];
}

export interface SearchPlace {
  uuid: string;
  name: string;
  categories: string[];
  heroImageUrl: string;
  isOrderable: boolean;
  slug: string;
}

export const GetSearchFeed: OperationDef<{ query: string }, SearchResult> = {
  name: 'getSearchFeedV1',
  buildBody: ({ query }) => ({
    userQuery: query,
    date: '',
    startTime: 0,
    endTime: 0,
    sortAndFilters: [],
    vertical: 'ALL',
    searchSource: 'SEARCH_BAR',
    displayType: 'SEARCH_RESULTS',
    searchType: 'GLOBAL_SEARCH',
    keyName: '',
    cacheKey: '',
    recaptchaToken: '',
  }),
  parseData: (data) => {
    const d = data as { feedItems?: Array<RawFeedItem>; storesMap?: Record<string, RawFeedStore> };
    const places: SearchPlace[] = [];
    const seen = new Set<string>();

    // Prefer storesMap if present.
    if (d.storesMap) {
      for (const raw of Object.values(d.storesMap)) {
        if (!raw.uuid || seen.has(raw.uuid)) continue;
        seen.add(raw.uuid);
        places.push({
          uuid: raw.uuid,
          name: raw.title ?? '',
          categories: (raw.categories ?? []).filter((c): c is string => !!c),
          heroImageUrl: raw.heroImageUrl ?? '',
          isOrderable: raw.isOrderable ?? false,
          slug: raw.slug ?? '',
        });
      }
    }

    // Fallback: walk feedItems for store entries.
    for (const item of d.feedItems ?? []) {
      if (item.type !== 'store' || !item.store?.uuid) continue;
      if (seen.has(item.store.uuid)) continue;
      seen.add(item.store.uuid);
      places.push({
        uuid: item.store.uuid,
        name: item.store.title ?? '',
        categories: (item.store.categories ?? []).filter((c): c is string => !!c),
        heroImageUrl: item.store.heroImageUrl ?? '',
        isOrderable: item.store.isOrderable ?? false,
        slug: item.store.slug ?? '',
      });
    }

    return { places };
  },
};

interface RawFeedItem { type: string; store?: RawFeedStore; }
interface RawFeedStore {
  uuid?: string;
  title?: string;
  slug?: string;
  categories?: Array<string | null>;
  heroImageUrl?: string;
  isOrderable?: boolean;
}

// =========================================================================
// createDraftOrderV2 — populates the cart (our "reorder" operation)
// =========================================================================

export interface DraftOrderCreated {
  draftOrderUuid: string;
  storeUuid: string;
  itemCount: number;
}

export const CreateDraftOrder: OperationDef<{ items: ShoppingCartItem[] }, DraftOrderCreated> = {
  name: 'createDraftOrderV2',
  buildBody: ({ items }) => ({
    isMulticart: true,
    shoppingCartItems: items,
  }),
  parseData: (data) => {
    const d = data as { draftOrder?: { uuid?: string; storeUuid?: string; shoppingCart?: { items?: unknown[] } } };
    if (!d.draftOrder?.uuid) throw new Error('createDraftOrderV2: missing draftOrder.uuid');
    return {
      draftOrderUuid: d.draftOrder.uuid,
      storeUuid: d.draftOrder.storeUuid ?? '',
      itemCount: d.draftOrder.shoppingCart?.items?.length ?? 0,
    };
  },
};
