import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ApiError } from './api';

export type Language = 'en' | 'zh';
const STORAGE_KEY = 'family-menu.language';

const en = {
  'nav.menu': 'Menu',
  'nav.meals': 'Meals',
  'nav.shopping': 'Shopping',
  'nav.household': 'Household',
  'nav.main': 'Main navigation',
  'app.skip': 'Skip to content',
  'app.home': 'Family Menu home',
  'app.signIn': 'Sign in',
  'app.signOut': 'Sign out',
  'app.sample': 'Sample household',
  'app.signOutQuestion': 'Sign out?',
  'app.signOutDescription': 'You can sign in again with Google at any time.',
  'app.staySignedIn': 'Stay signed in',
  'app.signingOut': 'Signing out…',
  'app.dismiss': 'Dismiss',
  'app.sharedTable': 'YOUR SHARED TABLE',
  'app.heroEyebrow': 'GOOD FOOD, SHARED DAILY',
  'app.heroTitleFirst': 'A little planning.',
  'app.heroTitleSecond': 'A lot of together.',
  'app.heroDescriptionFirst': 'Keep the recipes you love, decide what’s for dinner,',
  'app.heroDescriptionSecond': 'and make room for more time around the table.',
  'app.explore': 'Explore the menu',
  'app.artCaption': 'made to be shared',
  'app.footer': 'A shared menu for the people you call home.',
  'app.footerNote':
    'Starter recipes are written for Family Menu · Virtual points have no cash value',
  'app.titleHome': 'Family Menu — A little more together',
  'app.titlePage': '{page} · Family Menu',
  'app.authExpired': 'Your session has ended. Please sign in again.',
  'app.signOutFailed': 'Could not sign out. Please try again.',
  'app.authFailed': 'Sign-in failed. Please try again.',
  'app.authStateInvalid': 'Your sign-in attempt expired or was interrupted. Please try again.',
  'app.authProviderDenied': 'Google sign-in was cancelled.',
  'app.authExchangeFailed': 'We could not confirm your Google sign-in. Please try again.',
  'app.authNotConfigured': 'Sign-in is not configured on this server yet.',
  'app.language': 'Language',
  'app.english': 'English',
  'app.chinese': '简体中文',
  'join.eyebrow': 'INVITATION',
  'join.title': 'Join a household',
  'join.incomplete': 'This invitation link is incomplete. Ask for a new link.',
  'join.loading': 'Loading…',
  'join.signInToSee': 'Sign in to see which household invited you.',
  'join.signInGoogle': 'Sign in with Google',
  'join.notConfigured': 'Sign-in is not configured on this server yet.',
  'join.checking': 'Checking your invitation…',
  'join.alreadyMember': 'You are already a member of this household.',
  'join.invited': 'You have been invited to share this household’s menu and meal orders.',
  'join.open': 'Open household',
  'join.join': 'Join household',
  'join.openFailed': 'This invitation could not be opened.',
  'join.joinFailed': 'Could not join the household.',
  'household.loadingYour': 'Loading your household…',
  'household.welcome': 'A place for your favourite people.',
  'household.signInDescription':
    'Sign in to create a household, invite the people you cook for, and share one menu.',
  'household.current': 'Current household',
  'household.start': 'Start your household',
  'household.startDescription':
    'Create one for your home, or open an invitation link from someone who already has one.',
  'household.createAnother': 'Create another household',
  'household.create': 'Create a household',
  'household.name': 'Household name',
  'household.namePlaceholder': 'e.g. The Wang family',
  'household.createButton': 'Create household',
  'household.createFailed': 'Could not create the household.',
  'household.loadFailed': 'Could not load the household.',
  'household.actionFailed': 'Something went wrong.',
  'household.loading': 'Loading household…',
  'household.eyebrow': 'YOUR HOUSEHOLD',
  'household.timezoneRole': 'Time zone: {timezone} · You are {role}',
  'household.ownerRole': 'the owner',
  'household.memberRole': 'a member',
  'household.members': 'Members ({count})',
  'household.you': ' (you)',
  'household.owner': 'Owner',
  'household.remove': 'Remove {name}',
  'household.removeConfirm': 'Remove {name} from {household}?',
  'household.leave': 'Leave household',
  'household.leaveConfirm': 'Leave {name}?',
  'household.invite': 'Invite someone',
  'household.inviteDescription':
    'Each link works once and expires in 7 days. Anyone who joins can edit the shared menu and household orders.',
  'household.createLink': 'Create invitation link',
  'household.newLink': 'New invitation link (shown once)',
  'household.copyLink': 'Copy invitation link',
  'household.copied': 'Copied.',
  'household.activeLinks': 'Active links ({count})',
  'household.expires': 'Expires {date}',
  'household.revokeLink': 'Revoke invitation link',
  'menu.eyebrow': 'SOMETHING FOR EVERYONE',
  'menu.yours': 'Your household menu',
  'menu.starters': 'Starter recipes',
  'menu.recipeCount': '{count} recipes',
  'menu.oneRecipe': '1 recipe',
  'menu.starterCount': '{count} starter recipes',
  'menu.search': 'Search recipes',
  'menu.searchPlaceholder': 'Find something delicious...',
  'menu.archivedCount': 'Archived ({count})',
  'menu.draftAi': 'Draft with AI',
  'menu.addRecipe': 'Add recipe',
  'menu.found': '{count} recipes found',
  'menu.loading': 'Loading your menu…',
  'menu.archived': 'Archived',
  'menu.pointsPerServing': '{count} pts / serving',
  'menu.noResults': 'No recipes found',
  'menu.noArchived': 'Nothing archived',
  'menu.empty': 'Your menu is empty',
  'menu.tryAnother': 'Try another name.',
  'menu.archivedHint': 'Archived recipes stay here, ready to restore.',
  'menu.emptyHint':
    'Add a family favourite, or save one of the starter recipes below and make it yours.',
  'menu.clearSearch': 'Clear search',
  'menu.signInHint': 'Create or join a household to save and edit your own copies.',
  'menu.goHousehold': 'Go to Household',
  'menu.needIdeas': 'NEED IDEAS?',
  'menu.saveCopy': 'Save a copy, then make it yours',
  'menu.view': 'View {name}',
  'menu.serves': 'Serves {count}',
  'menu.loadingStarters': 'Loading starter recipes…',
  'menu.noStarters': 'No starter recipes found',
  'menu.starter': 'Starter',
  'menu.archivedRecipe': 'ARCHIVED RECIPE',
  'menu.yourMenu': 'YOUR MENU',
  'menu.starterRecipe': 'STARTER RECIPE',
  'menu.closeRecipe': 'Close recipe',
  'menu.photoOf': 'Photo of {name}',
  'menu.fullPoints': '{count} points per serving',
  'menu.ingredients': 'What you’ll need',
  'menu.noIngredients': 'No ingredients listed yet.',
  'menu.method': 'Method',
  'menu.addedBy': 'Added by {name}',
  'menu.changedBy': ' · last changed by {name}',
  'menu.fromStarter': ' · from a starter recipe',
  'menu.fromAi': ' · started from an AI draft',
  'menu.dropPhoto': 'Drop a photo here or',
  'menu.savingPhoto': 'Saving photo…',
  'menu.changePhoto': 'Change photo',
  'menu.addPhoto': 'Add photo',
  'menu.removePhoto': 'Remove photo',
  'menu.saveToMenu': 'Save to our menu',
  'menu.signInToSave': 'Sign in to save recipes',
  'menu.createToSave': 'Create or join a household to save your own copy.',
  'menu.order': 'Order',
  'menu.edit': 'Edit',
  'menu.archive': 'Archive',
  'menu.restore': 'Restore to menu',
  'error.offline': 'Family Menu could not be reached. Check your connection and try again.',
  'error.invalid': 'Some information is invalid. Please check it and try again.',
  'error.forbidden': 'You do not have access to this action.',
  'error.notFound': 'This item is no longer available. Please refresh.',
  'error.conflict': 'Someone changed this item. Refresh and try again.',
  'error.server': 'Something went wrong on our side. Please try again in a moment.',
  'error.generic': 'Something went wrong. Please try again.',
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  'nav.menu': '菜单',
  'nav.meals': '点单',
  'nav.shopping': '购物清单',
  'nav.household': '家庭',
  'nav.main': '主导航',
  'app.skip': '跳转到主要内容',
  'app.home': '家庭菜单首页',
  'app.signIn': '登录',
  'app.signOut': '退出登录',
  'app.sample': '示例家庭',
  'app.signOutQuestion': '确定退出登录？',
  'app.signOutDescription': '你随时可以使用 Google 重新登录。',
  'app.staySignedIn': '继续登录',
  'app.signingOut': '正在退出…',
  'app.dismiss': '关闭',
  'app.sharedTable': '我们的餐桌',
  'app.heroEyebrow': '每日美食，一起分享',
  'app.heroTitleFirst': '少一点筹划，',
  'app.heroTitleSecond': '多一点相聚。',
  'app.heroDescriptionFirst': '收藏喜欢的菜谱，决定晚餐吃什么，',
  'app.heroDescriptionSecond': '把更多时间留给同桌的人。',
  'app.explore': '浏览菜单',
  'app.artCaption': '一起分享',
  'app.footer': '为家人一起准备的共享菜单。',
  'app.footerNote': '预设菜谱由 Family Menu 编写 · 虚拟积分没有现金价值',
  'app.titleHome': '家庭菜单 — 一起好好吃饭',
  'app.titlePage': '{page} · 家庭菜单',
  'app.authExpired': '登录已过期，请重新登录。',
  'app.signOutFailed': '退出失败，请重试。',
  'app.authFailed': '登录失败，请重试。',
  'app.authStateInvalid': '登录请求已过期或被中断，请重试。',
  'app.authProviderDenied': '已取消 Google 登录。',
  'app.authExchangeFailed': '无法确认 Google 登录，请重试。',
  'app.authNotConfigured': '此服务器尚未配置登录。',
  'app.language': '语言',
  'app.english': 'English',
  'app.chinese': '简体中文',
  'join.eyebrow': '邀请',
  'join.title': '加入家庭',
  'join.incomplete': '邀请链接不完整，请让对方发送新链接。',
  'join.loading': '加载中…',
  'join.signInToSee': '登录后即可查看邀请你的家庭。',
  'join.signInGoogle': '使用 Google 登录',
  'join.notConfigured': '此服务器尚未配置登录。',
  'join.checking': '正在检查邀请…',
  'join.alreadyMember': '你已经是这个家庭的成员。',
  'join.invited': '你受邀共享这个家庭的菜单和点单。',
  'join.open': '打开家庭',
  'join.join': '加入家庭',
  'join.openFailed': '无法打开这个邀请。',
  'join.joinFailed': '无法加入家庭。',
  'household.loadingYour': '正在加载家庭…',
  'household.welcome': '和喜欢的人一起分享。',
  'household.signInDescription': '登录后可以创建家庭、邀请一起吃饭的人，并共享菜单。',
  'household.current': '当前家庭',
  'household.start': '创建你的家庭',
  'household.startDescription': '为家人创建一个家庭，或打开别人发来的邀请链接。',
  'household.createAnother': '创建另一个家庭',
  'household.create': '创建家庭',
  'household.name': '家庭名称',
  'household.namePlaceholder': '例如：王家',
  'household.createButton': '创建家庭',
  'household.createFailed': '无法创建家庭。',
  'household.loadFailed': '无法加载家庭。',
  'household.actionFailed': '操作失败。',
  'household.loading': '正在加载家庭…',
  'household.eyebrow': '我的家庭',
  'household.timezoneRole': '时区：{timezone} · 你的身份：{role}',
  'household.ownerRole': '创建者',
  'household.memberRole': '成员',
  'household.members': '成员（{count}）',
  'household.you': '（你）',
  'household.owner': '创建者',
  'household.remove': '移除{name}',
  'household.removeConfirm': '将{name}从{household}移除？',
  'household.leave': '退出家庭',
  'household.leaveConfirm': '退出{name}？',
  'household.invite': '邀请成员',
  'household.inviteDescription':
    '每个链接只能使用一次，7 天后过期。加入的成员可以编辑共享菜单和家庭订单。',
  'household.createLink': '创建邀请链接',
  'household.newLink': '新邀请链接（仅显示一次）',
  'household.copyLink': '复制邀请链接',
  'household.copied': '已复制。',
  'household.activeLinks': '有效链接（{count}）',
  'household.expires': '{date} 到期',
  'household.revokeLink': '撤销邀请链接',
  'menu.eyebrow': '每个人都有喜欢的味道',
  'menu.yours': '家庭菜单',
  'menu.starters': '预设菜谱',
  'menu.recipeCount': '{count} 道菜',
  'menu.oneRecipe': '1 道菜',
  'menu.starterCount': '{count} 道预设菜',
  'menu.search': '搜索菜谱',
  'menu.searchPlaceholder': '寻找喜欢的菜…',
  'menu.archivedCount': '已归档（{count}）',
  'menu.draftAi': '用 AI 起草',
  'menu.addRecipe': '添加菜谱',
  'menu.found': '找到 {count} 道菜',
  'menu.loading': '正在加载菜单…',
  'menu.archived': '已归档',
  'menu.pointsPerServing': '每份 {count} 积分',
  'menu.noResults': '没有找到菜谱',
  'menu.noArchived': '没有已归档的菜谱',
  'menu.empty': '菜单还是空的',
  'menu.tryAnother': '试试其他名称。',
  'menu.archivedHint': '归档的菜谱会留在这里，随时可以恢复。',
  'menu.emptyHint': '添加一道家常菜，或从下方预设菜谱保存一份自己的副本。',
  'menu.clearSearch': '清除搜索',
  'menu.signInHint': '创建或加入家庭后，就能保存和编辑自己的菜谱。',
  'menu.goHousehold': '前往家庭',
  'menu.needIdeas': '找点灵感？',
  'menu.saveCopy': '保存副本，再按喜好修改',
  'menu.view': '查看{name}',
  'menu.serves': '{count} 人份',
  'menu.loadingStarters': '正在加载预设菜谱…',
  'menu.noStarters': '没有找到预设菜谱',
  'menu.starter': '预设',
  'menu.archivedRecipe': '已归档菜谱',
  'menu.yourMenu': '家庭菜单',
  'menu.starterRecipe': '预设菜谱',
  'menu.closeRecipe': '关闭菜谱',
  'menu.photoOf': '{name}的照片',
  'menu.fullPoints': '每份 {count} 积分',
  'menu.ingredients': '所需食材',
  'menu.noIngredients': '还没有列出食材。',
  'menu.method': '做法',
  'menu.addedBy': '由{name}添加',
  'menu.changedBy': ' · 最后由{name}修改',
  'menu.fromStarter': ' · 来自预设菜谱',
  'menu.fromAi': ' · 从 AI 草稿开始',
  'menu.dropPhoto': '将照片拖到这里，或',
  'menu.savingPhoto': '正在保存照片…',
  'menu.changePhoto': '更换照片',
  'menu.addPhoto': '添加照片',
  'menu.removePhoto': '移除照片',
  'menu.saveToMenu': '保存到家庭菜单',
  'menu.signInToSave': '登录后保存菜谱',
  'menu.createToSave': '创建或加入家庭后就能保存自己的菜谱。',
  'menu.order': '点单',
  'menu.edit': '编辑',
  'menu.archive': '归档',
  'menu.restore': '恢复到菜单',
  'error.offline': '无法连接家庭菜单，请检查网络后重试。',
  'error.invalid': '部分信息无效，请检查后重试。',
  'error.forbidden': '你没有权限进行此操作。',
  'error.notFound': '此内容已不可用，请刷新页面。',
  'error.conflict': '其他人更新了此内容，请刷新后重试。',
  'error.server': '服务器暂时出了问题，请稍后重试。',
  'error.generic': '操作失败，请重试。',
};

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // Private browsing can make storage unavailable.
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  apiError: (error: ApiError) => string;
}

const Context = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hans' : 'en';
  }, [language]);
  const setLanguage = (next: Language) => {
    setCurrentLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current selection still works without persistent storage.
    }
  };
  const t: I18nValue['t'] = (key, values) => {
    let value: string = language === 'zh' ? zh[key] : en[key];
    for (const [name, replacement] of Object.entries(values ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };
  const apiError: I18nValue['apiError'] = (error) => {
    if (language === 'en') return error.message;
    if (error.status === 0) return t('error.offline');
    if (error.status === 400) return t('error.invalid');
    if (error.status === 401) return t('app.authExpired');
    if (error.status === 403) return t('error.forbidden');
    if (error.status === 404) return t('error.notFound');
    if (error.status === 409) return t('error.conflict');
    if (error.status >= 500) return t('error.server');
    return t('error.generic');
  };
  return (
    <Context.Provider value={{ language, setLanguage, t, apiError }}>{children}</Context.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(Context);
  if (!value) throw new Error('LanguageProvider is missing.');
  return value;
}
