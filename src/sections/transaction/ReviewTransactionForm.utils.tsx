import { SubmittableExtrinsic } from "@polkadot/api/types"
import { useAcountAssets } from "api/assetDetails"
import { useTokenBalance } from "api/balances"
import { useBestNumber } from "api/chain"
import { useEra } from "api/era"
import {
  useAcceptedCurrencies,
  useAccountCurrency,
  useSetAsFeePayment,
} from "api/payments"
import { useSpotPrice } from "api/spotPrice"
import { useNextNonce, usePaymentInfo } from "api/transaction"
import BigNumber from "bignumber.js"
import { Trans, useTranslation } from "react-i18next"
import { useAssetsModal } from "sections/assets/AssetsModal.utils"
import { useAccount } from "sections/web3-connect/Web3Connect.utils"
import { BN_1 } from "utils/constants"
import { useRpcProvider } from "providers/rpcProvider"
import { NATIVE_EVM_ASSET_DECIMALS, isEvmAccount } from "utils/evm"
import { BN_NAN } from "utils/constants"
import { useUserReferrer } from "api/referrals"
import { HYDRADX_CHAIN_KEY } from "sections/xcm/XcmPage.utils"
import { useReferralCodesStore } from "sections/referrals/store/useReferralCodesStore"
import { useEvmPaymentFee } from "api/evm"

export const useTransactionValues = ({
  xcallMeta,
  feePaymentId,
  fee,
  tx,
}: {
  xcallMeta?: Record<string, string>
  feePaymentId?: string
  fee?: BigNumber
  tx: SubmittableExtrinsic<"promise">
}) => {
  const { assets, api, featureFlags } = useRpcProvider()
  const { account } = useAccount()
  const bestNumber = useBestNumber()

  const isEvm = isEvmAccount(account?.address)
  const evmPaymentFee = useEvmPaymentFee(
    tx.method.toHex(),
    isEvm ? account?.address : "",
  )

  const accountFeePaymentAsset = useAccountCurrency(
    feePaymentId ? undefined : account?.address,
  )

  /* REFERRALS */

  const referrer = useUserReferrer(
    featureFlags.referrals ? account?.address : undefined,
  )

  const isLinkedAccount =
    featureFlags.referrals && !xcallMeta ? !!referrer.data?.length : true

  const storedReferralCodes = useReferralCodesStore()
  const storedReferralCode = account?.address
    ? storedReferralCodes.referralCodes[account.address]
    : undefined

  const boundedTx =
    featureFlags.referrals &&
    !isLinkedAccount &&
    storedReferralCode &&
    tx.method.method !== "linkCode" &&
    !xcallMeta
      ? api.tx.utility.batchAll([
          api.tx.referrals.linkCode(storedReferralCode),
          tx,
        ])
      : tx

  const isNewReferralLink = tx.method.method === "registerCode"

  /* */

  const { data: paymentInfo, isLoading: isPaymentInfoLoading } =
    usePaymentInfo(boundedTx)

  // fee payment asset which should be displayed on the screen
  const accountFeePaymentId = feePaymentId ?? accountFeePaymentAsset.data

  const feePaymentMeta = accountFeePaymentId
    ? assets.getAsset(accountFeePaymentId)
    : undefined

  const spotPrice = useSpotPrice(assets.native.id, accountFeePaymentId)
  const feeAssetBalance = useTokenBalance(accountFeePaymentId, account?.address)

  const isSpotPriceNan = spotPrice.data?.spotPrice.isNaN()

  const nonce = useNextNonce(account?.address)

  const era = useEra(
    boundedTx.era,
    bestNumber.data?.parachainBlockNumber.toString(),
    boundedTx.era.isMortalEra,
  )

  // assets with positive balance on the wallet
  const accountAssets = useAcountAssets(account?.address)

  const alllowedFeePaymentAssetsIds = isEvmAccount(account?.address)
    ? [accountFeePaymentId]
    : [
        ...(accountAssets.map((accountAsset) => accountAsset.asset.id) ?? []),
        accountFeePaymentId,
      ]

  const acceptedFeePaymentAssets = useAcceptedCurrencies([
    ...alllowedFeePaymentAssetsIds,
  ])

  const feePaymentValue = paymentInfo?.partialFee.toBigNumber() ?? BN_NAN
  const paymentFeeHDX = paymentInfo
    ? BigNumber(fee ?? paymentInfo.partialFee.toHex()).shiftedBy(
        -assets.native.decimals,
      )
    : null

  const isLoading =
    evmPaymentFee.isInitialLoading ||
    accountFeePaymentAsset.isInitialLoading ||
    isPaymentInfoLoading ||
    spotPrice.isInitialLoading ||
    nonce.isLoading ||
    acceptedFeePaymentAssets.some(
      (acceptedFeePaymentAsset) => acceptedFeePaymentAsset.isInitialLoading,
    ) ||
    referrer.isInitialLoading

  if (
    !feePaymentMeta ||
    !paymentFeeHDX ||
    !feeAssetBalance.data ||
    !accountFeePaymentId
  )
    return {
      isLoading,
      data: {
        isEnoughPaymentBalance: false,
        displayFeePaymentValue: BN_NAN,
        feePaymentMeta,
        acceptedFeePaymentAssets: [],
        era,
        nonce: nonce.data,
        isLinkedAccount,
        storedReferralCode,
        tx: boundedTx,
        isNewReferralLink,
      },
    }

  let displayFeePaymentValue

  if (!isSpotPriceNan) {
    displayFeePaymentValue = paymentFeeHDX.multipliedBy(
      spotPrice.data?.spotPrice ?? 1,
    )
  } else {
    const accountFeePaymentCurrency = acceptedFeePaymentAssets.find(
      (acceptedFeePaymentAsset) =>
        acceptedFeePaymentAsset.data?.id === accountFeePaymentId,
    )

    const transactionPaymentValue =
      accountFeePaymentCurrency?.data?.data?.shiftedBy(-feePaymentMeta.decimals)

    if (transactionPaymentValue)
      displayFeePaymentValue = BN_1.div(transactionPaymentValue).multipliedBy(
        paymentFeeHDX,
      )
  }

  let isEnoughPaymentBalance
  if (xcallMeta && xcallMeta?.srcChain === "bifrost") {
    // @TODO remove when fixed in xcm app
    isEnoughPaymentBalance = true
  } else if (xcallMeta && xcallMeta?.srcChain !== HYDRADX_CHAIN_KEY) {
    const feeBalanceDiff =
      parseFloat(xcallMeta.srcChainFeeBalance) -
      parseFloat(xcallMeta.srcChainFee)
    isEnoughPaymentBalance = feeBalanceDiff > 0
  } else {
    isEnoughPaymentBalance = feeAssetBalance.data.balance
      .shiftedBy(-feePaymentMeta.decimals)
      .minus(displayFeePaymentValue ?? 0)
      .gt(0)
  }

  const acceptedFeePaymentAssetIds =
    acceptedFeePaymentAssets
      .filter((acceptedFeeAsset) => acceptedFeeAsset?.data?.accepted)
      .map((acceptedFeeAsset) => acceptedFeeAsset?.data?.id) ?? []

  let displayEvmFeePaymentValue
  let evmAcceptedFeePaymentAssetIds: string[] = []

  if (isEvmAccount(account?.address) && evmPaymentFee?.data) {
    displayEvmFeePaymentValue = evmPaymentFee.data.shiftedBy(
      -NATIVE_EVM_ASSET_DECIMALS,
    )

    evmAcceptedFeePaymentAssetIds = [
      assets.getAsset(import.meta.env.VITE_EVM_NATIVE_ASSET_ID).id,
    ]
  }

  return {
    isLoading,
    data: {
      isEnoughPaymentBalance,
      displayFeePaymentValue,
      displayEvmFeePaymentValue,
      feePaymentValue,
      feePaymentMeta,
      acceptedFeePaymentAssets: displayEvmFeePaymentValue?.gt(0)
        ? evmAcceptedFeePaymentAssetIds
        : acceptedFeePaymentAssetIds,
      era,
      nonce: nonce.data,
      isLinkedAccount,
      storedReferralCode,
      tx: boundedTx,
      isNewReferralLink,
    },
  }
}

export const useEditFeePaymentAsset = (
  acceptedFeePaymentAssets: ReturnType<
    typeof useTransactionValues
  >["data"]["acceptedFeePaymentAssets"],
  feePaymentAssetId?: string,
) => {
  const { t } = useTranslation()
  const setFeeAsPayment = useSetAsFeePayment()

  const allowedAssets = acceptedFeePaymentAssets.filter(
    (id) => id !== feePaymentAssetId,
  )

  const {
    openModal: openEditFeePaymentAssetModal,
    modal: editFeePaymentAssetModal,
    isOpen: isOpenEditFeePaymentAssetModal,
  } = useAssetsModal({
    title: t("liquidity.reviewTransaction.modal.selectAsset"),
    hideInactiveAssets: true,
    allowedAssets,
    onSelect: (asset) =>
      setFeeAsPayment(asset.id.toString(), {
        onLoading: (
          <Trans
            t={t}
            i18nKey="wallet.assets.table.actions.payment.toast.onLoading"
            tOptions={{
              asset: asset.symbol,
            }}
          >
            <span />
            <span className="highlight" />
          </Trans>
        ),
        onSuccess: (
          <Trans
            t={t}
            i18nKey="wallet.assets.table.actions.payment.toast.onSuccess"
            tOptions={{
              asset: asset.symbol,
            }}
          >
            <span />
            <span className="highlight" />
          </Trans>
        ),
        onError: (
          <Trans
            t={t}
            i18nKey="wallet.assets.table.actions.payment.toast.onLoading"
            tOptions={{
              asset: asset.symbol,
            }}
          >
            <span />
            <span className="highlight" />
          </Trans>
        ),
      }),
  })

  return {
    openEditFeePaymentAssetModal,
    editFeePaymentAssetModal,
    isOpenEditFeePaymentAssetModal,
  }
}
