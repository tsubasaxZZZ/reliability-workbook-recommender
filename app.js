import Papa from 'papaparse';
import * as gridjs from 'gridjs';
import 'gridjs/dist/theme/mermaid.min.css';
import * as XLSX from 'xlsx';

// Map recommendations to issue
const checkItems = {
    OtherSku: {
        issue: {
            ja: "プロダクション環境で推奨されない SKU を使用している",
            en: "Using SKU not recommended for production environment"
        },
        comment: {
            ja: "Basic や Share 等のプロダクション環境に適さない SKU を利用されています。可用性やパフォーマンスにおいて問題が発生する可能性があります。",
            en: "You are using a SKU that is not suitable for production environments, such as Basic or Share. There may be problems with availability and performance."
        },
        recommendation: {
            ja: "上位の SKU への変更をご検討ください。上位の SKU への変更は構成変更や追加のコストが発生する可能性があります。",
            en: "Consider changing to a higher SKU. Changing to a higher SKU may result in configuration changes and additional costs."
        },
        priority: 0,
        checkFunction: function (row) {
            return (parseInt(row['OtherSku']) != 1) ? row : null;
        }
    },
    NoAZorAS: {
        issue: {
            ja: "可用性ゾーンもしくは可用性セットを利用していない",
            en: "Not using Availability Zone or Availability Set"
        },
        comment: {
            ja: "可用性ゾーンや可用性セットを利用していない場合、ホスト障害やメンテナンスによって仮想マシンにダウンタイムが発生します。",
            en: "If you are not using Availability Zones or Availability Sets, virtual machines will experience downtime due to host failures or maintenance."
        },
        recommendation: {
            ja: "可用性ゾーンもしくは可用性セットの利用を検討してください。可用性ゾーンが利用できるリージョンの場合は、可用性ゾーンを優先して検討します。可用性ゾーン、可用性セットを利用した場合でも自動的にワークロードが冗長化されることはありません。ワークロードに適した冗長化構成を検討する必要があります。",
            en: "Consider using Availability Zones or Availability Sets. If the region supports Availability Zones, Availability Zones are preferred. Even if you use Availability Zones or Availability Sets, your workload will not be automatically redundant. You need to consider a redundant configuration that is suitable for your workload."
        },
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['AvZoneCount']) + parseInt(row['AvSetCount'])) != 1) ? row : null;
        },
    },
    NoAZ: {
        issue: {
            ja: "可用性ゾーンが使用されていない",
            en: "Availability Zone is not used"
        },
        comment: {
            ja: "現在のリソースが可用性ゾーンを使用していない場合、単一のデータセンター内での障害がリソースに影響を与える可能性があります。",
            en: "If your current resource does not use Availability Zones, a single data center failure may affect your resource."
        },
        recommendation: {
            ja: "可用性ゾーンを使用してリソースをデプロイすることを検討してください。可用性ゾーンを使用することで、データセンター内の障害からリソースを保護し、サービスの可用性を向上させることができます。可用性ゾーンを使用する際には追加のコストがかかる場合がありますので、事前に確認してください。",
            en: "Consider deploying your resources using Availability Zones. Using Availability Zones protects your resources from data center failures and improves service availability. Using Availability Zones may incur additional costs, so please check in advance."
        },
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['AvZoneCount']) + parseInt(row['NAAvZoneCount'])) != 1) ? row : null;
        },
    },
    NoUsePremorUltOSDisk: {
        issue: {
            ja: "Premium ディスクもしくはUltraディスクを利用していない",
            en: "Not using Premium or Ultra disk"
        },
        comment: {
            ja: "Premium ディスクや Ultra ディスクを利用していない場合、ストレージのパフォーマンスや SLA に影響する可能性があります。",
            en: "If you are not using Premium or Ultra disks, you may experience performance and SLA issues with your storage."
        },
        recommendation: {
            ja: "Premium ディスクもしくは Ultra ディスクの利用を検討してください。ディスク SKU の変更は追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
            en: "Consider using Premium or Ultra disks. Changing disk SKUs may incur additional costs, so please check in advance."
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['PremorUltOSDiskCount']) != 1) ? row : null;
        },
    },
    RunningState: {
        issue: {
            ja: "起動状態もしくはプロビジョニング状態が失敗している",
            en: "Running state or provisioning state is failed"
        },
        comment: {
            ja: "リソースの起動状態、プロビジョニング状態が失敗状態です。サービスが正しく動作していない可能性があります。",
            en: "The running state or provisioning state of the resource is failed. The service may not be working properly."
        },
        recommendation: {
            ja: "リソースの状態を確認しトラブルシューティングをしてください。必要に応じてサポートへお問い合わせください。",
            en: "Check the status of the resource and troubleshoot. Contact support if necessary."
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['RunningState']) != 1) ? row : null;
        },
    },
    NoHealthyBackup: {
        issue: {
            ja: "バックアップが有効になっていない",
            en: "Backup is not enabled"
        },
        comment: {
            ja: "バックアップが有効になっていない場合、障害や予期しないオペレーションによってデータが破損した場合に復旧できない可能性があります。",
            en: "If backup is not enabled, you may not be able to recover if your data is corrupted by a failure or unexpected operation."
        },
        recommendation: {
            ja: "バックアップを有効にすることを検討してください。また取得したバックアップを使用し、リカバリできることを定期的に確認してください。バックアップを有効にすることで追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
            en: "Consider enabling backup. Also, regularly check that you can use the backup you have taken to recover. Enabling backup may incur additional costs, so please check in advance."
        },
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['HealthyBackupCount']) != 1) ? row : null;
        }
    },
    LowCapacity: {
        issue: {
            ja: "インスタンス数が 2 以上ではない",
            en: "Number of instances is less than 2"
        },
        comment: {
            ja: "単一のインスタンスで稼働している場合、障害やメンテナンスによってダウンタイムが発生する可能性があります。",
            en: "If you are running on a single instance, you may experience downtime due to failures or maintenance."
        },
        recommendation: {
            ja: "インスタンス数を増やすことを検討してください。インスタンス数を増やすことで追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
            en: "Consider increasing the number of instances. Increasing the number of instances may incur additional costs, so please check in advance."
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['Gt1CapacityCount']) != 1) ? row : null;
        }
    },
    NoV2StorageEnabled: {
        issue: {
            ja: "汎用 v2 ストレージ アカウント を利用していない",
            en: "Not using general purpose v2 storage account"
        },
        comment: {
            ja: "ストレージ アカウントには主に2つのバージョンがあります。以前のバージョンのストレージ アカウントはバックアップの取得が出来ない等の機能制限があります。",
            en: "There are mainly two versions of storage accounts. Previous versions of storage accounts have limited functionality, such as not being able to take backups."
        },
        recommendation: {
            ja: `汎用 v2 ストレージ アカウントにアップグレードすることをご検討ください。汎用 v2 ストレージ アカウントはコストモデルが従来のストレージ アカウントと異なるため追加のコストが発生する可能性があります。次のドキュメント、ブログを参照してください。<br>
        <a href="https://docs.microsoft.com/ja-jp/azure/storage/common/storage-account-upgrade/" target="_blank">https://docs.microsoft.com/ja-jp/azure/storage/common/storage-account-upgrade/</a><br>
        <a href="https://jpazasms.github.io/blog/AzureSubscriptionManagement/20190226c" target="_blank">https://jpazasms.github.io/blog/AzureSubscriptionManagement/20190226c/</a>`,
            en: `Consider upgrading to a general purpose v2 storage account. General purpose v2 storage accounts have a different cost model than traditional storage accounts, so additional costs may be incurred. See the following documents and blogs for more information.<br>
            <a href="https://docs.microsoft.com/en-us/azure/storage/common/storage-account-upgrade/" target="_blank">https://docs.microsoft.com/en-us/azure/storage/common/storage-account-upgrade/</a>`
        },
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['V2StorageEnabled']) != 1) ? row : null;
        }
    },
    NoRAStorageEnabled: {
        issue: {
            ja: "読み取りアクセスストレージを利用していない",
            en: "Not using read access storage"
        },
        comment: {
            ja: "読み取りアクセスストレージを利用していない場合、Microsoft によってフェールオーバーされるまでストレージ アカウントにアクセスができません。",
            en: "If you are not using read access storage, you will not be able to access your storage account until Microsoft fails over."
        },
        recommendation: {
            ja: `読み取りアクセスを有効にすることをご検討ください。変更手順について以下のドキュメントをご参照ください。<br>
        <a href="https://docs.microsoft.com/ja-jp/azure/storage/common/redundancy-migration" target="_blank">https://docs.microsoft.com/ja-jp/azure/storage/common/redundancy-migration</a>`,
            en: `Consider enabling read access. For instructions on how to make the change, see the following document.<br>
        <a href="https://docs.microsoft.com/en-us/azure/storage/common/redundancy-migration" target="_blank">https://docs.microsoft.com/en-us/azure/storage/common/redundancy-migration</a>`
        },
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['RAStorageEnabled']) != 1) ? row : null;
        }
    },
    NoAzVnetGwSku: {
        issue: {
            ja: "仮想ネットワーク ゲートウェイでゾーン冗長の SKU を利用していない",
            en: "Not using zone redundant SKU for virtual network gateway"
        },
        comment: {
            ja: "可用性ゾーンを使用していない場合ゲートウェイの障害やメンテナンスでネットワーク接続に影響が発生する可能性があります。",
            en: "If you are not using Availability Zones, you may experience network connectivity issues due to gateway failures or maintenance."
        },
        recommendation: {
            ja: `ゾーン冗長されたゲートウェイを利用することをご検討ください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/about-zone-redundant-vnet-gateways" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/about-zone-redundant-vnet-gateways</a>`,
            en: `Consider using a zone redundant gateway.<br>
        <a href="https://learn.microsoft.com/en-us/azure/vpn-gateway/about-zone-redundant-vnet-gateways" target="_blank">https://learn.microsoft.com/en-us/azure/vpn-gateway/about-zone-redundant-vnet-gateways</a>`
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['AzVnetGwSkuCount']) != 1) ? row : null;
        }
    },
    NoSucceededState: {
        issue: {
            ja: "リソースが正常に稼働していない可能性がある",
            en: "Resource may not be running properly"
        },
        comment: {
            ja: "リソースが正常に稼働していない可能性があります。リソースの状態を確認してください。",
            en: "The resource may not be running properly. Check the status of the resource."
        },
        recommendation: {
            ja: `リソースが正常に稼働していない可能性があります。リソースの状態を確認してください。`,
            en: `The resource may not be running properly. Check the status of the resource.`
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['SucceededStateCount']) != 1) ? row : null;
        }
    },
    NoGt1Capacity: {
        issue: {
            ja: "単一のインスタンスで稼働している可能性がある",
            en: "May be running on a single instance"
        },
        comment: {
            ja: "リソースが単一のインスタンスで稼働している可能性があります。",
            en: "The resource may be running on a single instance."
        },
        recommendation: {
            ja: `リソースのインスタンスを追加することをご検討ください。`,
            en: `Consider adding instances to your resource.`
        },
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['Gt1CapacityCount']) + parseInt(row['NACapacityCount'])) != 1) ? row : null;
        }
    },
    NoRouteVnetGwVpnType: {
        issue: {
            ja: "VPN の仮想ネットワーク ゲートウェイのタイプがルートベースの VPN ではない",
            en: "VPN virtual network gateway type is not route-based VPN"
        },
        comment: {
            ja: "現在の VPN ゲートウェイのタイプがルートベースの VPN ではない場合、より高度なルーティング設定や複数の VPN 接続の設定が制限される可能性があります。",
            en: "If the current VPN gateway type is not route-based VPN, you may be limited in advanced routing settings and multiple VPN connection settings."
        },
        recommendation: {
            ja: "VPN の仮想ネットワーク ゲートウェイのタイプをルートベースの VPN に変更することを検討してください。ルートベースの VPN に変更することで、より柔軟なルーティング設定や複数の VPN 接続をサポートできます。変更には追加のコストがかかる場合がありますので、事前に確認してください。",
            en: "Consider changing the VPN virtual network gateway type to route-based VPN. Changing to route-based VPN allows you to support more flexible routing settings and multiple VPN connections. Changing may incur additional costs, so please check in advance."
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['RouteVnetGwVpnTypeCount']) != 1) ? row : null;
        }
    },
    NoGen2VnetGw: {
        issue: {
            ja: "仮想ネットワーク ゲートウェイが Gen2 ではない",
            en: "Virtual network gateway is not Gen2"
        },
        comment: {
            ja: "現在の仮想ネットワーク ゲートウェイが Gen2 ではない場合、パフォーマンスや機能面で制限がかかる可能性があります。",
            en: "If the current virtual network gateway is not Gen2, you may be limited in terms of performance and functionality."
        },
        recommendation: {
            ja: `仮想ネットワーク ゲートウェイを Gen2 にアップグレードすることを検討してください。Gen2 にアップグレードすることで、より高いパフォーマンスや機能を利用できます。アップグレードには追加のコストがかかる場合がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-about-vpngateways" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-about-vpngateways</a>`,
            en: `Consider upgrading your virtual network gateway to Gen2. Upgrading to Gen2 allows you to take advantage of higher performance and functionality. Upgrading may incur additional costs, so please check in advance.<br>
        <a href="https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpngateways" target="_blank">https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpngateways</a>`
        },
        priority: 2,
        checkFunction: (row) => {
            return ((parseInt(row['Gen2VnetGwCount']) + parseInt(row['NAGen2VnetGwCount'])) != 1) ? row : null;
        }
    },
    NoActiveActiveVnetGw: {
        issue: {
            ja: "仮想ネットワーク ゲートウェイがアクティブ/アクティブ構成ではない",
            en: "Virtual network gateway is not active/active configuration"
        },
        comment: {
            ja: "現在の仮想ネットワーク ゲートウェイがアクティブ/アクティブ構成ではない場合、冗長性が低く、障害発生時のリスクが高まる可能性があります。",
            en: "If the current virtual network gateway is not active/active configuration, it may have low redundancy and increased risk of failure."
        },
        recommendation: {
            ja: `仮想ネットワーク ゲートウェイをアクティブ/アクティブ構成に変更することを検討してください。アクティブ/アクティブ構成にすることで、冗長性が向上し、障害発生時のリスクが低減されます。変更には追加のコストがかかる場合がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-highlyavailable" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-highlyavailable</a>`,
            en: `Consider changing your virtual network gateway to active/active configuration. Changing to active/active configuration improves redundancy and reduces the risk of failure. Changing may incur additional costs, so please check in advance.<br>
        <a href="https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-highlyavailable" target="_blank">https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-highlyavailable</a>`,
        },
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['ActiveActiveVnetGwCount']) + parseInt(row['NAActiveActiveVnetGwCount'])) != 1) ? row : null;
        }
    },
    // for API Management
    APIMUseOldPlatform: {
        issue: {
            ja: "API Managementが以前のプラットフォーム(stv1)上で稼働している",
            en: "API Management is running on the old platform (stv1)"
        },
        comment: {
            ja: "stv1 上にホストされた API Managemnt は、可用性ゾーン等の最新の Azure の機能を利用できません。stv1 プラットフォームでホストされている API Management インスタンスのサポートは、2024 年 8 月 31 日で廃止される予定です。",
            en: "API Managemnt hosted on stv1 does not have access to the latest Azure features such as Availability Zones. Support for API Management instances hosted on the stv1 platform will be discontinued on August 31, 2024."
        },
        recommendation: {
            ja: `stv1 から stv2 への移行をご検討ください。以下のドキュメントをご参照ください。<br><a href="https://learn.microsoft.com/ja-JP/azure/api-management/compute-infrastructure">https://learn.microsoft.com/ja-JP/azure/api-management/compute-infrastructure</a>`,
            en: `Consider migrating from stv1 to stv2. See the following document for more information.<br><a href="https://learn.microsoft.com/en-us/azure/api-management/compute-infrastructure">https://learn.microsoft.com/en-us/azure/api-management/compute-infrastructure</a>`
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['Stv2ApimCount']) != 1) ? row : null;
        }
    },
    // for Azure Front Door and CDN
    AFDStateIsNotRunning: {
        issue: {
            ja: "Azure Front Door の状態が失敗している",
            en: "Azure Front Door state is failed"
        },
        comment: {
            ja: "Azure Front Door の状態が失敗している",
            en: "Azure Front Door state is failed"
        },
        recommendation: {
            ja: "Azure Front Door の状態が失敗している",
            en: "Azure Front Door state is failed"
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['AfdActiveStateCount']) != 1) ? row : null;
        }
    },
    UseAFDLegacy: {
        issue: {
            ja: "以前の Azure Front Door SKU、CDN SKU を利用している",
            en: "Using legacy Azure Front Door SKU, CDN SKU"
        },
        comment: {
            ja: "以前の SKU を使用している場合最新の機能を活用できない可能性があります。また、一部のレガシー SKU は将来的にサポートが終了する可能性があります。これは、サービスの中断を引き起こす可能性があります。",
            en: "If you are using a legacy SKU, you may not be able to take advantage of the latest features. In addition, some legacy SKUs may be discontinued in the future. This may cause a service interruption."
        },
        recommendation: {
            ja: `最新の Azure Front Door SKU、CDN SKU への移行を検討してください。これにより、最新の機能を活用できます。移行に関する詳細は以下のドキュメントをご参照ください。ただし、SKUの変更には追加のコストがかかる可能性がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cdn/cdn-change-provider" target="_blank">https://learn.microsoft.com/ja-jp/azure/cdn/cdn-change-provider</a>`,
            en: `Consider migrating to the latest Azure Front Door SKU, CDN SKU. This allows you to take advantage of the latest features. For more information about migration, see the following document. However, changing the SKU may incur additional costs, so please check in advance.<br>
        <a href="https://learn.microsoft.com/en-us/azure/cdn/cdn-change-provider" target="_blank">https://learn.microsoft.com/en-us/azure/cdn/cdn-change-provider</a>`
        },
        priority: 1,
        checkFunction: (row) => {
            return (parseInt(row['AfdNonLegacySkuCount']) != 1) ? row : null;
        }
    },
    DBStateIsNotRunning: {
        issue: {
            ja: "DB の状態が失敗している",
            en: "DB state is failed"
        },
        comment: {
            ja: "DB の状態が失敗している",
            en: "DB state is failed"
        },
        recommendation: {
            ja: "DB の状態が失敗している",
            en: "DB state is failed"
        },
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['DBOnlineStateCount']) != 1) ? row : null;
        }
    },
    NotUseProductionDBSKU: {
        issue: {
            ja: "高可用性の SQL Database SKU を利用していない",
            en: "Not using high availability SQL Database SKU"
        },
        comment: {
            ja: "Premium/Business Criticalでは Always On可用性グループと同様のテクノロジーを使用して高可用性が実装されています。これにより、何らかの理由でプライマリ レプリカまたは読み取り可能なセカンダリ レプリカがクラッシュした場合に、フェールオーバー先となる完全に同期されたノードが常に存在することが保証されます。",
            en: "Premium/Business Critical uses the same technology as Always On Availability Groups to implement high availability. This ensures that there is always a fully synchronized node to fail over to if the primary replica or readable secondary replica crashes for some reason."
        },
        recommendation:{
            ja: `プロダクション環境では可用性を高めるため、Premium または Business CriticalのSKUを使用することを検討してください。ただし、SKUの変更には追加のコストがかかる可能性がありますので、事前に確認してください。<br>
        <a href='https://learn.microsoft.com/ja-jp/azure/azure-sql/database/high-availability-sla' target="_blank">https://learn.microsoft.com/ja-jp/azure/azure-sql/database/high-availability-sla</a>`,
            en: `Consider using Premium or Business Critical SKU to increase availability in production environments. However, changing the SKU may incur additional costs, so please check in advance.<br>
        <a href='https://learn.microsoft.com/en-us/azure/azure-sql/database/high-availability-sla' target="_blank">https://learn.microsoft.com/en-us/azure/azure-sql/database/high-availability-sla</a>`
        },
        priority: 1,
        checkFunction: (row) => {
            return (parseInt(row['SqlPremiumOrBusinessCriticalOrDwh']) != 1) ? row : null;
        }
    },
    NotUseGeoDBStorage: {
        issue: {
            ja: "SQL Database のバックアップストレージが Geo 冗長でない",
            en: "SQL Database backup storage is not Geo redundant"
        },
        comment: {
            ja: "SQL Database のバックアップストレージが Geo 冗長でない場合、リージョン全体の障害が発生したときにデータの復元が困難になる可能性があります。Geo 冗長ストレージは、プライマリリージョンのバックアップストレージに影響を与える障害から保護し、リージョン全体の障害が発生した場合でも別のリージョンからデータベースを復元することが可能になります。",
            en: "If the backup storage for SQL Database is not Geo redundant, it may be difficult to restore data in the event of a region-wide failure. Geo redundant storage protects the backup storage of the primary region from failures and allows you to restore the database from another region in the event of a region-wide failure."
        },
        recommendation: {
            ja: `バックアップストレージの冗長性を Geo 冗長ストレージに変更することを検討してください。これにより、リージョン全体の障害が発生した場合でもデータの復元が可能になります。ただし、Geo 冗長ストレージは追加のコストがかかる可能性があるため、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/azure-sql/database/automated-backups-overview" target="_blank">https://learn.microsoft.com/ja-jp/azure/azure-sql/database/automated-backups-overview</a>`,
            en: `Consider changing the backup storage redundancy to Geo redundant storage. This allows you to restore data even in the event of a region-wide failure. However, Geo redundant storage may incur additional costs, so please check in advance.<br>
        <a href="https://learn.microsoft.com/en-us/azure/azure-sql/database/automated-backups-overview" target="_blank">https://learn.microsoft.com/en-us/azure/azure-sql/database/automated-backups-overview</a>`
        },
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['DBGeoStorage']) != 1) ? row : null;
        }
    },
    NoCosmosDBReplica: {
        issue: {
            ja: "Cosmos DB の読み取りリージョンが 1 つしかない",
            en: "Cosmos DB has only one read region"
        },
        comment: {
            ja: "Cosmos DB の読み取りリージョンが 1 つしかない場合で特定のリージョンで問題が発生した場合、サービスの可用性に影響を及ぼす可能性があります。",
            en: "If Cosmos DB has only one read region and there is a problem with a specific region, it may affect the availability of the service."
        },
        recommendation: {
            ja: `Cosmos DB は、複数のリージョン間でデータをレプリケートする機能を提供しています。これにより、特定のリージョンがダウンした場合でも、他のリージョンからデータにアクセスすることが可能になります。従って、Cosmos DB の読み取りリージョンを増やすことを検討することをお勧めします。詳細については、以下のリンクをご参照ください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a>`,
            en: `Cosmos DB offers the ability to replicate data across multiple regions. This allows you to access data from other regions even if a specific region goes down. Therefore, we recommend that you consider increasing the number of read regions for Cosmos DB. For more information, see the following link.<br>
        <a href="https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability</a>`
        },
        priority: 0,
        checkFunction: (row) => {
            // return (parseInt(row['Gt0DbReplica']) != 1) ? row : null;
            return (parseInt(row['Gt0DbReplica']) != 0) ? row : null; // ToDo: Fix correct condition to check replica count
        }
    },
    NotUseMultiWriteCosmosDB: {
        issue: {
            ja: "Cosmos DB のマルチリージョン書き込みが有効になっていない",
            en: "Cosmos DB multi-region write is not enabled"
        },
        comment: {
            ja: "Cosmos DB のマルチリージョン書き込みを有効にすることで、アプリケーションは最も近いリージョンにデータを書き込むことができ、パフォーマンスの向上が期待できます。",
            en: "Enabling multi-region writes for Cosmos DB allows your application to write data to the nearest region, which can improve performance."
        },
        recommendation: { 
            ja: `Azure Cosmos DB を複数のリージョンで書き込みを受け付けるように構成することを検討してください。ただし、マルチリージョン書き込みの構成は競合を解決するための適切な戦略が必要です。詳細な情報と手順については、以下のドキュメントを参照してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/nosql/how-to-multi-master" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/nosql/how-to-multi-master</a>
        `,
            en: `Consider configuring Azure Cosmos DB to accept writes in multiple regions. However, configuring multi-region writes requires a proper strategy to resolve conflicts. For more information and instructions, see the following document.<br>
        <a href="https://learn.microsoft.com/en-us/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/en-us/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
        <a href="https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability</a><br>
        <a href="https://learn.microsoft.com/en-us/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/en-us/azure/well-architected/services/data/cosmos-db/reliability</a><br>
        <a href="https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-multi-master" target="_blank">https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-multi-master</a>
        `                
        },
        priority: 2,
        checkFunction: (row) => {
            return ((parseInt(row['EnabledDbMultiWrite']) + parseInt(row['NADbMultiWrite'])) != 1) ? row : null;
        }
    },
    NotUseCosmosDBAutomaticFO: {
        issue: {
            ja: "Cosmos DB の自動フェールオーバーが有効になっていない",
            en: "Cosmos DB automatic failover is not enabled"
        },
        comment: {
            ja: "Cosmos DBの自動フェールオーバーが有効になっていないと、障害が発生した場合にデータベースへのアクセスの可用性が低下する可能性があります。",
            en: "If Cosmos DB automatic failover is not enabled, the availability of access to the database may be reduced in the event of a failure."
        },
        recommendation: {
            ja: `Cosmos DBの自動フェールオーバーを有効にすることを強く推奨します。これにより、障害が発生した場合でもデータベースへのアクセスの可用性が維持され、ビジネスの継続性が確保されます。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/how-to-manage-database-account" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/how-to-manage-database-account</a>
        `,
            en: `It is strongly recommended that you enable automatic failover for Cosmos DB. This ensures that access to the database is maintained and business continuity is ensured even in the event of a failure.<br>
            <a href="https://learn.microsoft.com/en-us/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/en-us/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
            <a href="https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/en-us/azure/cosmos-db/high-availability</a><br>
            <a href="https://learn.microsoft.com/en-us/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/en-us/azure/well-architected/services/data/cosmos-db/reliability</a><br>
            <a href="https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-database-account" target="_blank">https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-database-account</a>
            `
        },
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['ConfiguredAutomaticFailover']) + parseInt(row['NAAutomaticFailover'])) != 1) ? row : null;
        }
    },
    NotUseFlexiblePostgreSQLAutomaticFO: {
        issue: {
            ja: "Azure Database for PostgreSQL - Flexible Server が高可用性構成になっていない",
            en: "Azure Database for PostgreSQL - Flexible Server is not in high availability configuration"
        },
        comment: {
            ja: "Azure Database for PostgreSQL - Flexible Server が高可用性構成になっていない",
            en: "Azure Database for PostgreSQL - Flexible Server is not in high availability configuration"
        },
        recommendation: {
            ja: `Azure Database for PostgreSQL - Flexible Server が高可用性構成になっていない`,
            en: `Azure Database for PostgreSQL - Flexible Server is not in high availability configuration`
        },
        priority: 1,
        checkFunction: (row) => {
            return ((parseInt(row['ConfiguredAutomaticFailover']) + parseInt(row['NAAutomaticFailover'])) != 1) ? row : null;
        }
    },
    NoGeoBackup: {
        issue: {
            ja: "バックアップストレージが Geo 冗長でない",
            en: "Backup storage is not Geo redundant"
        },
        comment: {
            ja: "バックアップストレージが Geo 冗長でない場合、リージョン全体の障害が発生したときにデータの復元が困難になる可能性があります。Geo 冗長ストレージは、プライマリリージョンのバックアップストレージに影響を与える障害から保護し、リージョン全体の障害が発生した場合でも別のリージョンからデータベースを復元することが可能になります。",
            en: "If your backup storage is not Geo redundant, it can be difficult to restore data in the event of a region-wide failure Geo redundant storage protects against failures affecting the backup storage in the primary region, making it It makes it possible to restore the database from another region."
        },
        recommendation: {
            ja: `バックアップストレージの冗長性を Geo 冗長ストレージに変更することを検討してください。これにより、リージョン全体の障害が発生した場合でもデータの復元が可能になります。ただし、Geo 冗長ストレージは追加のコストがかかる可能性があるため、事前に確認してください。`,
            en: `Consider changing the backup storage redundancy to Geo redundant storage. This will allow you to restore data even if a region-wide failure occurs. However, Geo redundant storage may incur additional costs, so please check in advance.`
        },
        priority: 1,
        checkFunction: (row) => {
            return ((parseInt(row['NABackupCount']) + parseInt(row['EnabledBackupCount'])) != 1) ? row : null;
        }
    },
    UseV1AppGW: {
        issue: {
            ja: "Application Gateway v1 が使用されている",
            en: "Application Gateway v1 is used"
        },
        comment: {
            ja: "Application Gateway v1 は、可用性ゾーンが利用できない等 Application Gateway v2 に比べて機能が制限されています。また、2026 年 4 月にリタイアされる予定です。",
            en: "Application Gateway v1 has limited functionality compared to Application Gateway v2, such as the inability to use Availability Zones. It is also scheduled to be retired in April 2026."
        },
        recommendation: {
            ja: `Application Gateway v2 への移行を検討してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/application-gateway/v1-retirement" target="_blank">https://learn.microsoft.com/ja-jp/azure/application-gateway/v1-retirement</a>
        `,
            en: `Consider migrating to Application Gateway v2.<br>
        <a href="https://learn.microsoft.com/en-us/azure/application-gateway/v1-retirement" target="_blank">https://learn.microsoft.com/en-us/azure/application-gateway/v1-retirement</a>`
        },
        priority: 0,
        checkFunction: (row) => {
            return (row['V2AppGwSkuCount'] != 1) ? row : null;
        }
    },
    DisableAppGWAutoScale: {
        issue: {
            ja: "Application Gateway の自動スケールが無効になっている",
            en: "Application Gateway auto scale is disabled"
        },
        comment: {
            ja: "自動スケールが無効になっていると、トラフィックの変動に対して適切にスケールアップまたはスケールダウンできません。これは、サービスのパフォーマンスの問題やダウンタイムを引き起こす可能性があります。",
            en: "If auto scale is disabled, it will not be able to scale up or down appropriately in response to traffic fluctuations. This can lead to performance issues and downtime."
        },
        recommendation: {
            ja: `Application Gateway の自動スケール機能を有効にすることを検討してください。これにより、システムは需要に応じてスケールアップまたはスケールダウンし、リソースの効率的な利用とサービスの高可用性を確保します。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/application-gateway/application-gateway-autoscaling-zone-redundant" target="_blank">https://learn.microsoft.com/ja-jp/azure/application-gateway/application-gateway-autoscaling-zone-redundant</a>
        `,
            en: `Consider enabling Application Gateway's auto scale feature. This allows the system to scale up or down as needed, ensuring efficient use of resources and high availability of the service.<br>
        <a href="https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-autoscaling-zone-redundant" target="_blank">https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-autoscaling-zone-redundant</a>`
        },
        priority: 1,
        checkFunction: (row) => {
            return (row['AutoScaleAppGwCount'] != 1) ? row : null;
        }
    },
    NoFaultDomain: {
        issue: {
            ja: "障害ドメインが利用されていない",
            en: "No fault domain is used"
        },
        comment: {
            ja: "障害ドメインが利用されていない",
            en: "No fault domain is used"
        },
        recommendation: {
            ja: `障害ドメインを利用してください。`,
            en: `Use fault domains.`
        },
        priority: 1,
        checkFunction: (row) => {
            return (row['Gt0FaultDomainCount'] != 1) ? row : null;
        }

    }
    
}

// Mapping resource types to check functions
const resourceTypeChecks = {
    // Compute
    'microsoft.compute/virtualmachines': ["NoAZorAS", "NoUsePremorUltOSDisk", "NoHealthyBackup"],
    'microsoft.compute/virtualmachinescalesets': ["LowCapacity", "NoFaultDomain", "NoUsePremorUltOSDisk"],
    // Containers
    'microsoft.containerservice/managedclusters': ["NoAZorAS", "LowCapacity", "NoUsePremorUltOSDisk"],
    // Databases
    'microsoft.sql/servers/databases': ["NoAZ", "DBStateIsNotRunning", "NotUseProductionDBSKU", "NotUseGeoDBStorage"],
      // ToDo: Synapse
    'microsoft.documentdb/databaseaccounts': ["NoCosmosDBReplica", "NotUseMultiWriteCosmosDB", "NotUseCosmosDBAutomaticFO"],
      // ToDo: MySQL
    'microsoft.dbforpostgresql/flexibleservers': ["DBStateIsNotRunning", "OtherSku", "NoAZ", "NotUseFlexiblePostgreSQLAutomaticFO", "NoGeoBackup"],
      // ToDo: Redis
    // Integration
    'microsoft.apimanagement/service': ["OtherSku", "NoSucceededState", "NoAZ", "LowCapacity", "APIMUseOldPlatform"],
    // Networking
      // ToDo: Azure Firewall
    'microsoft.cdn/profiles': ["UseAFDLegacy", "AFDStateIsNotRunning"],
    'microsoft.network/frontdoors': ["UseAFDLegacy", "AFDStateIsNotRunning"],
    'microsoft.network/applicationgateways': ["RunningState", "NoAZ", "LowCapacity", "UseV1AppGW", "DisableAppGWAutoScale"],
      // ToDo: Load Balancer
    'microsoft.network/publicipaddresses': ["OtherSku", "NoSucceededState", "NoAZ"],
    'microsoft.network/virtualnetworkgateways': ["NoAzVnetGwSku", "NoSucceededState", "NoGt1Capacity", "NoRouteVnetGwVpnType", "NoGen2VnetGw", "NoActiveActiveVnetGw"],
    // Storage
    '*storageaccounts*': ["NoV2StorageEnabled", "NoRAStorageEnabled"],
    // Web
    'microsoft.web/serverfarms': ["OtherSku", "RunningState", "NoAZ", "LowCapacity"],
    'microsoft.web/sites': ["OtherSku", "RunningState"],
      // ToDo: Function App
    // ToDo: Azure Site Recovery
    // ToDo: Service Alert
};
function getAnchor() {
    const lang = window.location.hash.substring(1);
    // if lang is null, set default language to en
    if (lang == "") {
        return "en";
    } else {
        return lang;
    }
}
function processData(csvData) {
    const header = csvData[0];
    const dataRows = csvData.slice(1);

    // Group the results by issue
    const groupedResults = {};

    const lang = getAnchor();

    dataRows.forEach(row => {
        const rowObj = Object.fromEntries(header.map((column, i) => [column, row[i]]));
        const resourceType = rowObj.Service;

        // Find matching resourceTypeChecks keys
        const matchedResourceTypes = Object.keys(resourceTypeChecks).filter(key => {
            if (key.includes('*')) {
                const keyRegex = new RegExp(key.replace(/\*/g, '.*'));
                return keyRegex.test(resourceType);
            } else {
                return key === resourceType;
            }
        });

        matchedResourceTypes.forEach(r => {
            resourceTypeChecks[r].forEach(targetResourceType => {
                const check = checkItems[targetResourceType];
                const result = check.checkFunction(rowObj);

                if (result) {
                    // Add the resource to the issue group if it doesn't exist
                    if (!groupedResults[check.issue[lang]]) {
                        groupedResults[check.issue[lang]] = {
                            issue: check.issue[lang],
                            recommendation: check.recommendation[lang],
                            priority: check.priority,
                            comment: check.comment[lang],
                            resources: []
                        };
                    }
                    // Add the resource to the issue group
                    groupedResults[check.issue[lang]].resources.push(rowObj);
                }
            });
        });
    });


    console.log("groupedResults", groupedResults);
    // Convert grouped results to issue tables
    const issueTables = Object.values(groupedResults).map((issueGroup, index) => {
        const issueDataRows = issueGroup.resources.map(resource => {
            const resourceIdParts = resource.Name.split("/");
            const subscription = resourceIdParts[2];
            const resourceGroup = resourceIdParts[4];
            const resourceType = `${resourceIdParts[6]}/${resourceIdParts[7]}`;
            const resourceName = resourceIdParts[8];

            return [
                resource.Name, // ResourceId
                subscription,
                resourceGroup,
                resourceType,
                resourceName,
            ];
        });
        const issueTableId = `issue-table-${index}`;
        issueGroup.resourceLink = `#${issueTableId}`;

        return {
            issueGroup,
            issueTable: {
                issueTitle: issueGroup.issue,
                headers: ['ResourceId', 'Subscription', 'ResourceGroup', 'ResourceType', 'Resource'],
                data: issueDataRows,
                tableId: issueTableId,
            },
        };
    });
    // sort issueTables by issuGroup.priority
    issueTables.sort((a, b) => {
        return a.issueGroup.priority - b.issueGroup.priority;
    });
    console.log("sorted issueTables----->", issueTables);
    return issueTables;
}


function renderGrid(headers, data, elementId) {
    const grid = new gridjs.Grid({
        columns: headers,
        data: data,
        sort: true,
        search: true,
        resizable: true,
        pagination: {
            enabled: true,
            limit: 10
        },
        style: {
            table: {
                'font-size': '14px',
            },
            th: {
                'background-color': 'rgba(0, 0, 0, 0.1)',
                color: '#000',
                'border-bottom': '1px solid #ccc',
                'padding': '8px',
            },
            td: {
                'padding': '8px',
                'border-bottom': '1px solid #ccc',
            },
        }
    });

    grid.render(document.getElementById(elementId));
}
function createExcelFile(issueTables) {
    const workbook = XLSX.utils.book_new();

    const issuesData = [['No', 'Issue', 'Comment', 'Recommendation', 'Priority', 'Resource Link']];
    issueTables.forEach(({ issueGroup, issueTable }, index) => {
        issuesData.push([
            index + 1,
            issueGroup.issue,
            issueGroup.comment,
            issueGroup.recommendation?.replace(/<[^>]*>/g, '') || '', // Remove HTML tags. If recommendation is null, set empty string.
            issueGroup.priority,
            `Issue ${index + 1}`,
        ]);

        const issueTableData = [
            issueTable.headers,
            ...issueTable.data,
        ];

        const issueWorksheet = XLSX.utils.aoa_to_sheet(issueTableData);
        XLSX.utils.book_append_sheet(workbook, issueWorksheet, `Issue ${index + 1}`);
    });

    const issuesWorksheet = XLSX.utils.aoa_to_sheet(issuesData);
    XLSX.utils.book_append_sheet(workbook, issuesWorksheet, 'Issues');

    // Add hyperlinks to the Resource Link cells in the Issues sheet
    for (let i = 1; i < issuesData.length; i++) {
        const cell_ref = XLSX.utils.encode_cell({ c: 5, r: i }); // Column F (5), row i
        if (!issuesWorksheet[cell_ref].l) issuesWorksheet[cell_ref].l = {};
        issuesWorksheet[cell_ref].l.Target = `#'Issue ${i}'!A1`;
    }

    return workbook;
}

// Add a click event listener for the upload-button element
document.getElementById('upload-button').addEventListener('click', () => {
    document.getElementById('input-csv').click();
});
document.getElementById('input-csv').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        complete: (results) => {
            if (results.errors.length) {
                console.error('Error parsing CSV:', results.errors);
                return;
            }

            const issueTables = processData(results.data);
            console.log(results.data)

            // Create issues table
            const issuesHeaders = ['No', 'Issue', 'Comment', { name: 'Recommendation', formatter: (_, row) => gridjs.html(row.cells[3].data) }, 'Priority', { name: 'Resource Link', formatter: (_, row) => gridjs.html(row.cells[5].data) }];
            const issuesData = issueTables.map(({ issueGroup }, i) => [
                i + 1,
                issueGroup.issue,
                issueGroup.comment,
                issueGroup.recommendation,
                issueGroup.priority,
                `<a href="${issueGroup.resourceLink}">View Resources</a>`,
            ]);

            console.log("issuesData", issuesData);
            renderGrid(issuesHeaders, issuesData, 'issues');

            // Create issue tables and append them to the page
            issueTables.forEach(({ issueTable }) => {
                const tableTitle = document.createElement('h3');
                console.log(issueTable);
                tableTitle.textContent = `${issueTable.issueTitle}`;
                document.getElementById('resources').appendChild(tableTitle);

                // Create a div element for the issue table
                const issueTableContainer = document.createElement('div');
                issueTableContainer.id = issueTable.tableId;
                document.getElementById('resources').appendChild(issueTableContainer);

                renderGrid(issueTable.headers, issueTable.data, issueTable.tableId);
            });
            // Create Excel file and save it to a global variable
            window.workbook = createExcelFile(issueTables);
            // Hide the input-csv element and the upload-label, show the download-excel and reload-page buttons
            document.getElementById('input-csv').style.display = 'none';
            document.getElementById('upload-button').style.display = 'none';
            document.getElementById('download-excel').style.display = 'inline-block';
            document.getElementById('reload-page').style.display = 'inline-block';

        }

    });
});
document.getElementById('download-excel').addEventListener('click', () => {
    if (window.workbook) {
        XLSX.writeFile(window.workbook, 'issues.xlsx');
    } else {
        alert('Please upload a CSV file first.');
    }
});

// Add a click event listener for the reload-page button
document.getElementById('reload-page').addEventListener('click', () => {
    location.reload();
});
