import '@polkadot/types-codec'
import { ProviderInterface } from '@polkadot/rpc-provider/types'
import { WsProvider } from '@polkadot/api'

import { DataSource } from 'typeorm'

import { Api } from './api'
import { Blockchain } from './blockchain'
import { Config } from './schema'
import { GenesisProvider } from './genesis-provider'
import { InherentProviders, SetTimestamp, SetValidationData } from './blockchain/inherent'
import { defaultLogger } from './logger'
import { importStorage, overrideWasm } from './utils/import-storage'
import { openDb } from './db'

export const setup = async (argv: Config) => {
  let provider: ProviderInterface
  if (argv.genesis) {
    if (typeof argv.genesis === 'string') {
      provider = await GenesisProvider.fromUrl(argv.genesis)
    } else {
      provider = new GenesisProvider(argv.genesis)
    }
  } else {
    provider = new WsProvider(argv.endpoint)
  }
  const api = new Api(provider)
  await api.isReady

  let blockHash: string
  if (argv.block == null) {
    blockHash = await api.getBlockHash()
  } else if (Number.isInteger(argv.block)) {
    blockHash = await api.getBlockHash(Number(argv.block))
  } else {
    blockHash = argv.block as string
  }

  defaultLogger.info({ ...argv, blockHash }, 'Args')

  let db: DataSource | undefined
  if (argv.db) {
    db = await openDb(argv.db)
  }

  const header = await api.getHeader(blockHash)

  // TODO: do we really need to set a custom timestamp?
  // const timestamp = argv.timestamp

  const setTimestamp = new SetTimestamp()
  const inherents = new InherentProviders(setTimestamp, [new SetValidationData()])

  const chain = new Blockchain({
    api,
    buildBlockMode: argv['build-block-mode'],
    inherentProvider: inherents,
    db,
    header: {
      hash: blockHash,
      number: Number(header.number),
    },
  })

  const context = { chain, api, ws: provider }

  await importStorage(chain, argv['import-storage'])
  await overrideWasm(chain, argv['wasm-override'])

  return context
}