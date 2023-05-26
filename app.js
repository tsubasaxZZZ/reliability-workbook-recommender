import Papa from 'papaparse';
import * as gridjs from 'gridjs';
import 'gridjs/dist/theme/mermaid.min.css';
import * as XLSX from 'xlsx';

// Map recommendations to issue
const checkItems = {
    OtherSku: {
        issue: "プロダクション環境で推奨されない SKU を使用している",
        comment: "Basic や Share 等のプロダクション環境に適さない SKU を利用されています。可用性やパフォーマンスにおいて問題が発生する可能性があります。",
        recommendation: "上位の SKU への変更をご検討ください。上位の SKU への変更は構成変更や追加のコストが発生する可能性があります。",
        priority: 0,
        checkFunction: function (row) {
            return (parseInt(row['OtherSku']) != 1) ? row : null;
        }
    },
    NoAZorAS: {
        issue: "可用性ゾーンもしくは可用性セットを利用していない",
        comment: "可用性ゾーンや可用性セットを利用していない場合、ホスト障害やメンテナンスによって仮想マシンにダウンタイムが発生します。",
        recommendation: "可用性ゾーンもしくは可用性セットの利用を検討してください。可用性ゾーンが利用できるリージョンの場合は、可用性ゾーンを優先して検討します。可用性ゾーン、可用性セットを利用した場合でも自動的にワークロードが冗長化されることはありません。ワークロードに適した冗長化構成を検討する必要があります。",
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['AvZoneCount']) + parseInt(row['AvSetCount'])) != 1) ? row : null;
        },
    },
    NoAZ: {
        issue: "可用性ゾーンが使用されていない",
        comment: "現在のリソースが可用性ゾーンを使用していない場合、単一のデータセンター内での障害がリソースに影響を与える可能性があります。",
        recommendation: "可用性ゾーンを使用してリソースをデプロイすることを検討してください。可用性ゾーンを使用することで、データセンター内の障害からリソースを保護し、サービスの可用性を向上させることができます。可用性ゾーンを使用する際には追加のコストがかかる場合がありますので、事前に確認してください。",
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['AvZoneCount']) + parseInt(row['NAAvZoneCount'])) != 1) ? row : null;
        },
    },
    NoUsePremorUltOSDisk: {
        issue: "Premium ディスクもしくはUltraディスクを利用していない",
        comment: "Premium ディスクや Ultra ディスクを利用していない場合、ストレージのパフォーマンスや SLA に影響する可能性があります。",
        recommendation: "Premium ディスクもしくは Ultra ディスクの利用を検討してください。ディスク SKU の変更は追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['PremorUltOSDiskCount']) != 1) ? row : null;
        },
    },
    RunningState: {
        issue: "起動状態もしくはプロビジョニング状態が失敗している",
        comment: "リソースの起動状態、プロビジョニング状態が失敗状態です。サービスが正しく動作していない可能性があります。",
        recommendation: "リソースの状態を確認しトラブルシューティングをしてください。必要に応じてサポートへお問い合わせください。",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['RunningState']) != 1) ? row : null;
        },
    },
    NoHealthyBackup: {
        issue: "バックアップが有効になっていない",
        comment: "バックアップが有効になっていない場合、障害や予期しないオペレーションによってデータが破損した場合に復旧できない可能性があります。",
        recommendation: "バックアップを有効にすることを検討してください。また取得したバックアップを使用し、リカバリできることを定期的に確認してください。バックアップを有効にすることで追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['HealthyBackupCount']) != 1) ? row : null;
        }
    },
    LowCapacity: {
        issue: "インスタンス数が 2 以上ではない",
        comment: "単一のインスタンスで稼働している場合、障害やメンテナンスによってダウンタイムが発生する可能性があります。",
        recommendation: "インスタンス数を増やすことを検討してください。インスタンス数を増やすことで追加のコストが発生する可能性があるため事前に確認することをお勧めします。",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['Gt1CapacityCount']) != 1) ? row : null;
        }
    },
    NoV2StorageEnabled: {
        issue: "汎用 v2 ストレージ アカウント を利用していない ",
        comment: "ストレージ アカウントには主に2つのバージョンがあります。以前のバージョンのストレージ アカウントはバックアップの取得が出来ない等の機能制限があります。",
        recommendation: `汎用 v2 ストレージ アカウントにアップグレードすることをご検討ください。汎用 v2 ストレージ アカウントはコストモデルが従来のストレージ アカウントと異なるため追加のコストが発生する可能性があります。次のドキュメント、ブログを参照してください。<br>
        <a href="https://docs.microsoft.com/ja-jp/azure/storage/common/storage-account-upgrade/" target="_blank">https://docs.microsoft.com/ja-jp/azure/storage/common/storage-account-upgrade/</a><br>
        <a href="https://jpazasms.github.io/blog/AzureSubscriptionManagement/20190226c" target="_blank">https://jpazasms.github.io/blog/AzureSubscriptionManagement/20190226c/</a>`,
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['V2StorageEnabled']) != 1) ? row : null;
        }
    },
    NoRAStorageEnabled: {
        issue: "読み取りアクセスストレージを利用していない",
        comment: "読み取りアクセスストレージを利用していない場合、Microsoft によってフェールオーバーされるまでストレージ アカウントにアクセスができません。",
        recommendation: `読み取りアクセスを有効にすることをご検討ください。変更手順について以下のドキュメントをご参照ください。<br>
        <a href="https://docs.microsoft.com/ja-jp/azure/storage/common/redundancy-migration" target="_blank">https://docs.microsoft.com/ja-jp/azure/storage/common/redundancy-migration</a>`,
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['RAStorageEnabled']) != 1) ? row : null;
        }
    },
    NoAzVnetGwSku: {
        issue: "仮想ネットワーク ゲートウェイでゾーン冗長の SKU を利用していない",
        comment: "可用性ゾーンを使用していない場合ゲートウェイの障害やメンテナンスでネットワーク接続に影響が発生する可能性があります。",
        recommendation: `ゾーン冗長されたゲートウェイを利用することをご検討ください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/about-zone-redundant-vnet-gateways" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/about-zone-redundant-vnet-gateways</a>`,
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['AzVnetGwSkuCount']) != 1) ? row : null;
        }
    },
    NoSucceededState: {
        issue: "リソースが正常に稼働していない可能性がある",
        comment: "リソースが正常に稼働していない可能性があります。リソースの状態を確認してください。",
        recommendation: `リソースが正常に稼働していない可能性があります。リソースの状態を確認してください。`,
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['SucceededStateCount']) != 1) ? row : null;
        }
    },
    NoGt1Capacity: {
        issue: "単一のインスタンスで稼働している可能性がある",
        comment: "リソースが単一のインスタンスで稼働している可能性があります。",
        recommendation: `リソースのインスタンスを追加することをご検討ください。`,
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['Gt1CapacityCount']) + parseInt(row['NACapacityCount'])) != 1) ? row : null;
        }
    },
    NoRouteVnetGwVpnType: {
        issue: "VPN の仮想ネットワーク ゲートウェイのタイプがルートベースの VPN ではない",
        comment: "現在の VPN ゲートウェイのタイプがルートベースの VPN ではない場合、より高度なルーティング設定や複数の VPN 接続の設定が制限される可能性があります。",
        recommendation: "VPN の仮想ネットワーク ゲートウェイのタイプをルートベースの VPN に変更することを検討してください。ルートベースの VPN に変更することで、より柔軟なルーティング設定や複数の VPN 接続をサポートできます。変更には追加のコストがかかる場合がありますので、事前に確認してください。",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['RouteVnetGwVpnTypeCount']) != 1) ? row : null;
        }
    },
    NoGen2VnetGw: {
        issue: "仮想ネットワーク ゲートウェイが Gen2 ではない",
        comment: "現在の仮想ネットワーク ゲートウェイが Gen2 ではない場合、パフォーマンスや機能面で制限がかかる可能性があります。",
        recommendation: `仮想ネットワーク ゲートウェイを Gen2 にアップグレードすることを検討してください。Gen2 にアップグレードすることで、より高いパフォーマンスや機能を利用できます。アップグレードには追加のコストがかかる場合がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-about-vpngateways" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-about-vpngateways</a>`,
        priority: 2,
        checkFunction: (row) => {
            return ((parseInt(row['Gen2VnetGwCount']) + parseInt(row['NAGen2VnetGwCount'])) != 1) ? row : null;

        }
    },
    NoActiveActiveVnetGw: {
        issue: "仮想ネットワーク ゲートウェイがアクティブ/アクティブ構成ではない",
        comment: "現在の仮想ネットワーク ゲートウェイがアクティブ/アクティブ構成ではない場合、冗長性が低く、障害発生時のリスクが高まる可能性があります。",
        recommendation: `仮想ネットワーク ゲートウェイをアクティブ/アクティブ構成に変更することを検討してください。アクティブ/アクティブ構成にすることで、冗長性が向上し、障害発生時のリスクが低減されます。変更には追加のコストがかかる場合がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-highlyavailable" target="_blank">https://learn.microsoft.com/ja-jp/azure/vpn-gateway/vpn-gateway-highlyavailable</a>`,
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['ActiveActiveVnetGwCount']) + parseInt(row['NAActiveActiveVnetGwCount'])) != 1) ? row : null;
        }
    },
    // for API Management
    APIMUseOldPlatform: {
        issue: "API Managementが以前のプラットフォーム(stv1)上で稼働している",
        comment: "stv1 上にホストされた API Managemnt は、可用性ゾーン等の最新の Azure の機能を利用できません。stv1 プラットフォームでホストされている API Management インスタンスのサポートは、2024 年 8 月 31 日で廃止される予定です。",
        recommendation: `stv1 から stv2 への移行をご検討ください。以下のドキュメントをご参照ください。<br><a href="https://learn.microsoft.com/ja-JP/azure/api-management/compute-infrastructure">https://learn.microsoft.com/ja-JP/azure/api-management/compute-infrastructure</a>`,
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['Stv2ApimCount']) != 1) ? row : null;
        }
    },
    // for Azure Front Door and CDN
    AFDStateIsNotRunning: {
        issue: "Azure Front Door の状態が失敗している",
        comment: "Azure Front Door の状態が失敗している",
        recommendation: "Azure Front Door の状態が失敗している",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['AfdActiveStateCount']) != 1) ? row : null;
        }
    },
    UseAFDLegacy: {
        issue: "以前の Azure Front Door SKU、CDN SKU を利用している",
        comment: "以前の SKU を使用している場合最新の機能を活用できない可能性があります。また、一部のレガシー SKU は将来的にサポートが終了する可能性があります。これは、サービスの中断を引き起こす可能性があります。",
        recommendation: `最新の Azure Front Door SKU、CDN SKU への移行を検討してください。これにより、最新の機能を活用できます。移行に関する詳細は以下のドキュメントをご参照ください。ただし、SKUの変更には追加のコストがかかる可能性がありますので、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cdn/cdn-change-provider" target="_blank">https://learn.microsoft.com/ja-jp/azure/cdn/cdn-change-provider</a>`,
        priority: 1,
        checkFunction: (row) => {
            return (parseInt(row['AfdNonLegacySkuCount']) != 1) ? row : null;
        }
    },
    DBStateIsNotRunning: {
        issue: "DB の状態が失敗している",
        comment: "DB の状態が失敗している",
        recommendation: "DB の状態が失敗している",
        priority: 0,
        checkFunction: (row) => {
            return (parseInt(row['DBOnlineStateCount']) != 1) ? row : null;
        }
    },
    NotUseProductionDBSKU: {
        issue: "高可用性の SQL Database SKU を利用していない",
        comment: "Premium/Business Criticalでは Always On可用性グループと同様のテクノロジーを使用して高可用性が実装されています。これにより、何らかの理由でプライマリ レプリカまたは読み取り可能なセカンダリ レプリカがクラッシュした場合に、フェールオーバー先となる完全に同期されたノードが常に存在することが保証されます。",
        recommendation: `プロダクション環境では可用性を高めるため、Premium または Business CriticalのSKUを使用することを検討してください。ただし、SKUの変更には追加のコストがかかる可能性がありますので、事前に確認してください。<br>
        <a href='https://learn.microsoft.com/ja-jp/azure/azure-sql/database/high-availability-sla' target="_blank">https://learn.microsoft.com/ja-jp/azure/azure-sql/database/high-availability-sla</a>`,
        priority: 1,
        checkFunction: (row) => {
            return (parseInt(row['SqlPremiumOrBusinessCriticalOrDwh']) != 1) ? row : null;
        }
    },
    NotUseGeoDBStorage: {
        issue: "SQL Database のバックアップストレージが Geo 冗長でない",
        comment: "SQL Database のバックアップストレージが Geo 冗長でない場合、リージョン全体の障害が発生したときにデータの復元が困難になる可能性があります。Geo 冗長ストレージは、プライマリリージョンのバックアップストレージに影響を与える障害から保護し、リージョン全体の障害が発生した場合でも別のリージョンからデータベースを復元することが可能になります。",
        recommendation: `バックアップストレージの冗長性を Geo 冗長ストレージに変更することを検討してください。これにより、リージョン全体の障害が発生した場合でもデータの復元が可能になります。ただし、Geo 冗長ストレージは追加のコストがかかる可能性があるため、事前に確認してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/azure-sql/database/automated-backups-overview" target="_blank">https://learn.microsoft.com/ja-jp/azure/azure-sql/database/automated-backups-overview</a>`,
        priority: 2,
        checkFunction: (row) => {
            return (parseInt(row['DBGeoStorage']) != 1) ? row : null;
        }
    },
    NoCosmosDBReplica: {
        issue: "Cosmos DB の読み取りリージョンが 1 つしかない",
        comment: "Cosmos DB の読み取りリージョンが 1 つしかない場合で特定のリージョンで問題が発生した場合、サービスの可用性に影響を及ぼす可能性があります。",
        recommendation: `Cosmos DB は、複数のリージョン間でデータをレプリケートする機能を提供しています。これにより、特定のリージョンがダウンした場合でも、他のリージョンからデータにアクセスすることが可能になります。従って、Cosmos DB の読み取りリージョンを増やすことを検討することをお勧めします。詳細については、以下のリンクをご参照ください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a>`,
        priority: 0,
        checkFunction: (row) => {
            // return (parseInt(row['Gt0DbReplica']) != 1) ? row : null;
            return (parseInt(row['Gt0DbReplica']) != 0) ? row : null; // ToDo: Fix correct condition to check replica count
        }
    },
    NotUseMultiWriteCosmosDB: {
        issue: "Cosmos DB のマルチリージョン書き込みが有効になっていない",
        comment: "Cosmos DB のマルチリージョン書き込みを有効にすることで、アプリケーションは最も近いリージョンにデータを書き込むことができ、パフォーマンスの向上が期待できます。",
        recommendation: `Azure Cosmos DB を複数のリージョンで書き込みを受け付けるように構成することを検討してください。ただし、マルチリージョン書き込みの構成は競合を解決するための適切な戦略が必要です。詳細な情報と手順については、以下のドキュメントを参照してください。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/nosql/how-to-multi-master" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/nosql/how-to-multi-master</a>
        `,
        priority: 2,
        checkFunction: (row) => {
            return ((parseInt(row['EnabledDbMultiWrite']) + parseInt(row['NADbMultiWrite'])) != 1) ? row : null;
        }
    },
    NotUseCosmosDBAutomaticFO: {
        issue: "Cosmos DB の自動フェールオーバーが有効になっていない",
        comment: "Cosmos DBの自動フェールオーバーが有効になっていないと、障害が発生した場合にデータベースへのアクセスの可用性が低下する可能性があります。",
        recommendation: `Cosmos DBの自動フェールオーバーを有効にすることを強く推奨します。これにより、障害が発生した場合でもデータベースへのアクセスの可用性が維持され、ビジネスの継続性が確保されます。<br>
        <a href="https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db" target="_blank">https://learn.microsoft.com/ja-jp/azure/architecture/solution-ideas/articles/globally-distributed-mission-critical-applications-using-cosmos-db</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/high-availability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability" target="_blank">https://learn.microsoft.com/ja-jp/azure/well-architected/services/data/cosmos-db/reliability</a><br>
        <a href="https://learn.microsoft.com/ja-jp/azure/cosmos-db/how-to-manage-database-account" target="_blank">https://learn.microsoft.com/ja-jp/azure/cosmos-db/how-to-manage-database-account</a>
        `,
        priority: 0,
        checkFunction: (row) => {
            return ((parseInt(row['ConfiguredAutomaticFailover']) + parseInt(row['NAAutomaticFailover'])) != 1) ? row : null;
        }
    },
}

// Mapping resource types to check functions
const resourceTypeChecks = {
    'microsoft.compute/virtualmachines': ["NoAZorAS", "NoUsePremorUltOSDisk", "NoHealthyBackup"],
    'microsoft.containerservice/managedclusters': ["NoAZorAS", "LowCapacity", "NoUsePremorUltOSDisk"],
    '*storageaccounts*': ["NoV2StorageEnabled", "NoRAStorageEnabled"],
    'microsoft.network/virtualnetworkgateways': ["NoAzVnetGwSku", "NoSucceededState", "NoGt1Capacity", "NoRouteVnetGwVpnType", "NoGen2VnetGw", "NoActiveActiveVnetGw"],
    'microsoft.network/publicipaddresses': ["OtherSku", "NoSucceededState", "NoAZ"],
    'microsoft.apimanagement/service': ["OtherSku", "NoSucceededState", "NoAZ", "LowCapacity", "APIMUseOldPlatform"],
    'microsoft.web/serverfarms': ["OtherSku", "RunningState", "NoAZ", "LowCapacity"],
    'microsoft.web/sites': ["OtherSku", "RunningState"],
    'microsoft.cdn/profiles': ["UseAFDLegacy", "AFDStateIsNotRunning"],
    'microsoft.network/frontdoors': ["UseAFDLegacy", "AFDStateIsNotRunning"],
    'microsoft.sql/servers/databases': ["NoAZ", "DBStateIsNotRunning", "NotUseProductionDBSKU", "NotUseGeoDBStorage"],
    'microsoft.documentdb/databaseaccounts': ["NoCosmosDBReplica", "NotUseMultiWriteCosmosDB", "NotUseCosmosDBAutomaticFO"],
};

function processData(csvData) {
    const header = csvData[0];
    const dataRows = csvData.slice(1);

    // Group the results by issue
    const groupedResults = {};

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
                    if (!groupedResults[check.issue]) {
                        groupedResults[check.issue] = {
                            issue: check.issue,
                            recommendation: check.recommendation,
                            priority: check.priority,
                            comment: check.comment,
                            resources: []
                        };
                    }
                    // Add the resource to the issue group
                    groupedResults[check.issue].resources.push(rowObj);
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
            issueGroup.recommendation.replace(/<[^>]*>/g, ''),
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
