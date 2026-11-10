package {{group}};

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;

@Mod({{class}}.MODID)
public final class {{class}} {
    public static final String MODID = "{{modid}}";

    public {{class}}(IEventBus modEventBus) {
        // 在这里注册内容（DeferredRegister 等）
    }
}
