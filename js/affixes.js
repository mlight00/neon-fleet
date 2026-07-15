// 엘리트 변이(어픽스): 적에 특성을 붙여 "같은 적 + 변이 = 새로운 적"을 만든다.
// 새 스프라이트 없이 색 오라 + 아이콘으로 표시. 순수 로직(롤·적용)은 테스트 가능.
// 게임 개체(entities.js)와 순환 참조를 피하려고 클래스는 import하지 않는다 —
// 분열은 entity.splits 플래그만 세팅해 각 적의 자체 사망 코드가 처리한다.
import { BAL } from './balance.js';

// 변이별 적용 가능한 적 종류 (kind 문자열)
export const AFFIX_KINDS = {
  swift:  ['creature', 'sniper', 'turret', 'weaver', 'charger', 'mine'],
  shield: ['creature', 'sniper', 'turret', 'weaver', 'charger'],
  split:  ['creature'],                       // 분열은 크리처 전용 (자체 splits 로직 재사용)
  toxic:  ['creature', 'charger', 'mine'],    // 접촉 피해가 있는 적만
  elite:  ['creature', 'turret', 'charger'],  // 큰 HP 표적
  magnet: ['sniper', 'turret', 'weaver'],     // 탄을 쏘는 적만
};

/** 가중 없는 균등 추첨 (rng 주입 → 테스트 가능) */
function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/**
 * 섹터 기반 변이 등장 확률 (지시서 §4.6, 순수 함수).
 * 섹터 1 = 0(첫 원정엔 변이 없음), 이후 섹터마다 +0.08, 상한 0.50.
 */
export function affixChanceForSector(sector) {
  if (sector <= 1) return 0;
  return Math.min(0.50, 0.08 * (sector - 1));
}

/**
 * 적 종류·섹터에 따라 붙일 변이 키 배열을 추첨한다. 순수 함수.
 * 확률=affixChanceForSector(섹터), 2중 변이는 섹터 4부터. 종류에 맞는 변이만 후보가 된다.
 */
export function rollAffixes(kind, sector, rng, cfg = BAL.affix) {
  const chance = affixChanceForSector(sector);
  if (rng() >= chance) return [];
  const eligible = Object.keys(cfg.defs).filter((k) => AFFIX_KINDS[k]?.includes(kind));
  if (!eligible.length) return [];
  const picks = [pick(eligible, rng)];
  const maxCount = sector >= 4 ? 2 : 1;   // 2중 변이는 섹터 4부터
  if (maxCount >= 2 && rng() < chance) {
    const rest = eligible.filter((k) => k !== picks[0]);
    if (rest.length) picks.push(pick(rest, rng));
  }
  return picks;
}

/**
 * 추첨된 변이를 적 개체에 적용한다 (개체 필드를 변형). 순수하진 않지만 DOM 무관 → 테스트 가능.
 * 즉시 반영되는 스탯(HP·크기·발사속도)은 여기서, 런타임 동작(흡수·유도·독성)은 플래그로.
 */
export function applyAffixes(entity, keys, cfg = BAL.affix) {
  if (!keys || !keys.length) return entity;
  entity.affixes = keys.slice();
  for (const k of keys) {
    const d = cfg.defs[k];
    if (!d) continue;
    if (k === 'swift') {
      entity.spdMult = (entity.spdMult || 1) * d.spd;
      if (entity.fireInterval) entity.fireInterval *= d.fire;
    } else if (k === 'shield') {
      entity.shieldCharges = (entity.shieldCharges || 0) + d.charges;
    } else if (k === 'split') {
      entity.splits = Math.max(entity.splits || 0, d.count);
    } else if (k === 'toxic') {
      entity.contactMult = (entity.contactMult || 1) * d.contact;
    } else if (k === 'elite') {
      entity.hp = Math.round(entity.hp * d.hp);
      entity.maxHp = entity.hp;
      entity.r *= d.radius;
      entity.spriteScale = (entity.spriteScale || 1) * d.radius;
      entity.eliteBounty = (entity.eliteBounty || 0) + d.bounty;
      entity.eliteCoin = (entity.eliteCoin || 0) + d.coin;
    } else if (k === 'magnet') {
      entity.shotHoming = d.homing;
    }
  }
  return entity;
}

/** 롤 + 적용을 한 번에 (스폰 시 호출). sector = 콘텐츠 티어. 변이가 없으면 그대로 반환. */
export function maybeAffix(entity, kind, sector, rng) {
  return applyAffixes(entity, rollAffixes(kind, sector, rng));
}

/** 보호막 흡수: 남은 충전이 있으면 1 소모하고 true(피격 무효) 반환. */
export function affixAbsorb(entity, world) {
  if (entity.shieldCharges > 0) {
    entity.shieldCharges--;
    if (world) {
      world.effects.ring(entity.x, entity.y, BAL.affix.defs.shield.color);
      world.effects.burst(entity.x, entity.y, BAL.affix.defs.shield.color, 6, 100);
    }
    return true;
  }
  return false;
}

/** 접촉 피해 배수 (독성). */
export function affixContactMult(entity) {
  return entity.contactMult || 1;
}

/** 이 적이 쏘는 탄에 실을 유도 강도 (자성탄). 0이면 직진. */
export function affixShotHoming(entity) {
  return entity.shotHoming || 0;
}

/** 사망 시: 엘리트면 드론·코인 보상 지급 + 금빛 폭발. */
export function affixOnDeath(entity, world) {
  if (entity.eliteBounty) {
    world.squad.applyDelta(entity.eliteBounty, world, '엘리트 격파!');
    world.addCoins(entity.eliteCoin || 0);
    world.effects.burst(entity.x, entity.y, BAL.affix.defs.elite.color, 26, 240);
    world.effects.ring(entity.x, entity.y, BAL.affix.defs.elite.color);
  }
}

/** 변이 오라 + 아이콘 배지 (각 적 draw 끝에서 월드 좌표로 호출). */
export function affixDraw(ctx, entity) {
  const keys = entity.affixes;
  if (!keys || !keys.length) return;
  const r = entity.r || 14;
  ctx.save();
  // 색 오라 링 (변이마다 반지름 살짝 다르게 겹침)
  for (let i = 0; i < keys.length; i++) {
    const d = BAL.affix.defs[keys[i]];
    if (!d) continue;
    ctx.strokeStyle = d.color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, r + 4 + i * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 아이콘 배지 (적 위에 가로로 나열)
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  const total = keys.length;
  for (let i = 0; i < total; i++) {
    const d = BAL.affix.defs[keys[i]];
    if (!d) continue;
    const bx = entity.x + (i - (total - 1) / 2) * 15;
    const by = entity.y - r - 13;
    ctx.strokeStyle = 'rgba(5,6,15,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(d.icon, bx, by);
    ctx.fillStyle = d.color;
    ctx.fillText(d.icon, bx, by);
  }
  ctx.restore();
}
