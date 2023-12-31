import { Address, BigInt, log } from '@graphprotocol/graph-ts';
import { Pool } from '../../types/schema';
import { StablePool } from '../../types/templates/StablePool/StablePool';
import { ZERO, ONE } from './constants';

export const AMP_PRECISION = BigInt.fromI32(1000);

export function updateAmpFactor(pool: Pool): void {
  let poolContract = StablePool.bind(changetype<Address>(pool.address));

  pool.amp = getAmp(poolContract);

  pool.save();
}

// TODO: allow passing MetaStablePool once AS supports union types
export function getAmp(poolContract: StablePool): BigInt {
  let ampCall = poolContract.try_getAmplificationParameter();
  let amp = ZERO;
  if (!ampCall.reverted) {
    let value = ampCall.value.value0;
    let precision = ampCall.value.value2;
    amp = value.div(precision);
  }
  return amp;
}

export function calculateInvariant(amp: BigInt, balances: BigInt[], swapId: string): BigInt {
  let numTokens = balances.length;
  let sum = balances.reduce((a, b) => a.plus(b), ZERO);

  if (sum.isZero()) {
    return ZERO;
  }

  let prevInvariant: BigInt;
  let invariant = sum;
  let ampTimesTotal = amp.times(BigInt.fromI32(numTokens));

  for (let i = 0; i < 255; i++) {
    let D_P = invariant;

    for (let j = 0; j < numTokens; j++) {
      D_P = D_P.times(invariant).div(balances[j].times(BigInt.fromI32(numTokens)));
    }

    prevInvariant = invariant;

    invariant = invariant
      .times(
        ampTimesTotal
          .times(sum)
          .div(AMP_PRECISION)
          .plus(D_P.times(BigInt.fromI32(numTokens)))
      )
      .div(
        ampTimesTotal
          .minus(AMP_PRECISION)
          .times(invariant)
          .div(AMP_PRECISION)
          .plus(D_P.times(BigInt.fromI32(numTokens).plus(ONE)))
      );

    if (invariant.gt(prevInvariant)) {
      if (invariant.minus(prevInvariant).le(ONE)) {
        return invariant;
      }
    } else if (prevInvariant.minus(invariant).le(ONE)) {
      return invariant;
    }
  }

  log.error("Invariant didn't converge: {}", [swapId]);

  return invariant;
}
