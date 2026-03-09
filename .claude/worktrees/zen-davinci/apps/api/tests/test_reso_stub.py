import pytest

from app.integrations.reso import ResoMetadataClient, ResoTenantConfig


@pytest.mark.asyncio
async def test_reso_disabled_by_default() -> None:
    client = ResoMetadataClient()
    cfg = ResoTenantConfig(
        tenant_id="t",
        base_url="https://example.com",
        client_id="x",
        client_secret="y",
    )
    with pytest.raises(NotImplementedError):
        await client.fetch_metadata(cfg)
