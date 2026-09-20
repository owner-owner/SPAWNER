import mineflayer from 'mineflayer';
import express from 'express';

// 1. إعداد سيرفر Express لإبقاء Render شغالاً
const PORT = parseInt(process.env.PORT || '10000', 10);
const app = express();
app.get('/', (_req, res) => res.status(200).send('Spawner Bot Active'));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Express] Server running on port ${PORT}`);
});

// منع انهيار العملية عند حدوث أخطاء قراءة الحزم
process.on('uncaughtException', (err: Error) => {
  if (err.message.includes('abnormally large') || err.message.includes('Chunk size') || err.message.includes('Read error')) {
    console.log('[Spawner-Bot] 🛡️ تم التقاط وتجاهل خطأ حزمة عابر لتفادي الخروج.');
  } else {
    console.error('[UncaughtException]', err);
  }
});

// 2. إعدادات البوت والمدد الزمنية
const BOT_CONFIG = {
  host: 'zero7even.net',
  port: 25565,
  username: 'LZADGRE',
  version: '1.21.4', // 👈 تم التحديث إلى الإصدار المطلوبة من السيرفر
};

const RECONNECT_DELAY_MS = 15000; // 👈 تم رفع المهلة إلى 15 ثانية لمنع طرد التكرار السريع
const WORK_DURATION_MS = 4 * 60 * 60 * 1000; // 4 ساعات عمل داخل السيرفر
const REST_DURATION_MS = 1 * 60 * 60 * 1000; // ساعة واحدة استراحة خارج السيرفر

let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let spawnerInterval: ReturnType<typeof setInterval> | null = null;
let dropperInterval: ReturnType<typeof setInterval> | null = null;

let workTimer: ReturnType<typeof setTimeout> | null = null;
let isResting = false; // حاجز لمنع إعادة الاتصال أثناء فترة الاستراحة
let currentBot: mineflayer.Bot | null = null;

// دالة مساعدة لتوليد تأخير عشوائي (محاكاة العنصر البشري)
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearAllIntervals() {
  if (spawnerInterval) { clearInterval(spawnerInterval); spawnerInterval = null; }
  if (dropperInterval) { clearInterval(dropperInterval); dropperInterval = null; }
  if (workTimer) { clearTimeout(workTimer); workTimer = null; }
}

function scheduleReconnect(reason: string) {
  clearAllIntervals();
  
  if (isResting) {
    console.log(`[Spawner-Bot] 💤 البوت حالياً في فترة الاستراحة (ساعة). تم تجاهل طلب إعادة الاتصال.`);
    return;
  }

  console.log(`[Spawner-Bot] 🔄 إعادة الاتصال خلال 15 ثانية بسبب: ${reason}`);
  if (reconnectTimeout) return;

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startBot();
  }, RECONNECT_DELAY_MS);
}

function startBot() {
  if (isResting) return;
  console.log('[Spawner-Bot] ⏳ جاري بدء الاتصال بالسيرفر zero7even.net...');

  const bot = mineflayer.createBot({
    ...BOT_CONFIG,
    viewDistance: 'tiny',
    physicsEnabled: true,
    checkTimeoutInterval: 60 * 1000
  });

  currentBot = bot;

  bot.on('login', () => {
    console.log('[Spawner-Bot] ✅ تم الاتصال بالهوست وقبول الحساب!');
  });

  // دالة البحث والضغط على أيتم الـ Dropper
  async function clickDropperItem(window: any) {
    const dropperItem = window.slots.find((item: any) => {
      if (!item) return false;
      const nameMatch = item.name && item.name.includes('dropper');
      const customName = item.customName || item.displayName || '';
      const textMatch = customName.toLowerCase().includes('drop');
      return nameMatch || textMatch;
    });

    if (dropperItem) {
      try {
        console.log(`[Spawner-Bot] 🔘 الضغط الدوري على ايتم الـ Dropper (الخانة ${dropperItem.slot})...`);
        await bot.clickWindow(dropperItem.slot, 0, 0);
      } catch (err) {
        console.log('[Spawner-Bot] ⚠️ فشل الضغط على ايتم الـ Dropper.');
      }
    } else {
      console.log('[Spawner-Bot] ⚠️ لم يتم العثور على ايتم Dropper في الواجهة!');
    }
  }

  // دالة البحث والتفاعل المباشر مع السبونر (Right Click)
  async function interactWithSpawner() {
    const spawnerBlock = bot.findBlock({
      matching: (block) => block.name.includes('spawner'),
      maxDistance: 5
    });

    if (spawnerBlock) {
      try {
        console.log('[Spawner-Bot] 🎯 العثور على السبونر! جاري التثبيت والضغط كليك يمين...');
        if (dropperInterval) { clearInterval(dropperInterval); dropperInterval = null; }

        // النظر المباشر نحو السبونر
        await bot.lookAt(spawnerBlock.position.offset(0.5, 0.5, 0.5));
        await new Promise((resolve) => setTimeout(resolve, getRandomDelay(400, 800)));

        await bot.activateBlock(spawnerBlock);
        console.log('[Spawner-Bot] ✅ تم إرسال أمر الضغط على السبونر بنجاح!');
      } catch (err) {
        console.log('[Spawner-Bot] ❌ خطأ أثناء الضغط على السبونر:', err);
      }
    } else {
      console.log('[Spawner-Bot] ⚠️ لم يتم العثور على سبونر في نطاق 5 بلوكات!');
    }
  }

  // التعامل مع فتح القوائم والبحث عن الأيتم الذكي
  bot.on('windowOpen', async (window) => {
    console.log(`[Spawner-Bot] 📂 تم فتح واجهة جديدة ثابتة (حجمها: ${window.slots.length} خانة)...`);

    setTimeout(async () => {
      const storageItem = window.slots.find((item: any) => {
        if (!item) return false;
        const nameMatch = item.name && item.name.includes('chest');
        const customName = item.customName || item.displayName || '';
        const textMatch = customName.toLowerCase().includes('storage');
        return nameMatch || textMatch;
      });

      const dropperItem = window.slots.find((item: any) => {
        if (!item) return false;
        const nameMatch = item.name && item.name.includes('dropper');
        const customName = item.customName || item.displayName || '';
        const textMatch = customName.toLowerCase().includes('drop');
        return nameMatch || textMatch;
      });

      if (storageItem) {
        console.log(`[Spawner-Bot] 📦 تم إيجاد ايتم Spawner Storage (Chest) في الخانة ${storageItem.slot}! جاري الضغط...`);
        try {
          await bot.clickWindow(storageItem.slot, 0, 0);
        } catch (e) {
          console.log('[Spawner-Bot] ❌ خطأ أثناء الضغط على Chest:', e);
        }
      } else if (dropperItem) {
        console.log(`[Spawner-Bot] 💧 تم إيجاد ايتم Drop All Items (Dropper) في الخانة ${dropperItem.slot}!`);
        await clickDropperItem(window);

        if (dropperInterval) clearInterval(dropperInterval);
        dropperInterval = setInterval(() => {
          clickDropperItem(window);
        }, getRandomDelay(14000, 16000));
      } else {
        console.log('[Spawner-Bot] ⚠️ لم يتم التعرف على الأيتم المطلوبة داخل الواجهة!');
      }
    }, getRandomDelay(1000, 1500));
  });

  bot.on('windowClose', () => {
    console.log('[Spawner-Bot] 🔒 تم إغلاق القائمة.');
    if (dropperInterval) {
      clearInterval(dropperInterval);
      dropperInterval = null;
    }
  });

  // إدارة الدخول، التسجيل، والموافقة على TPA
  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString();
    console.log(`[Chat] ${text}`);

    const lowerText = text.toLowerCase();

    if (text.includes('AZSRGDTS34245')) {
      console.log('[Spawner-Bot] 🚀 تم رصد الرسالة AZSRGDTS34245! جاري إرسال /tpaccept...');
      bot.chat('/tpaccept');
    }

    if (lowerText.includes('/register') || lowerText.includes('register')) {
      bot.chat('/register AZERTY65 AZERTY65');
    } else if (lowerText.includes('/login') || lowerText.includes('login') || lowerText.includes('تسجيل الدخول')) {
      bot.chat('/login AZERTY65');
    }
  });

  bot.on('spawn', () => {
    console.log('[Spawner-Bot] 🎉 البوت ريسبون وظهر داخل العالم!');

    clearAllIntervals();

    // 🕒 الانتظار 7 ثوانٍ ثم كتابة أمر /smp
    setTimeout(() => {
      console.log('[Spawner-Bot] 🌐 إرسال الأمر /smp تلقائياً بعد 7 ثوانٍ...');
      bot.chat('/smp');
    }, 7000);

    // مؤقت 4 ساعات عمل ثم 1 ساعة استراحة
    workTimer = setTimeout(() => {
      console.log('[Spawner-Bot] 🛑 اكتملت مدة العمل (4 ساعات). جاري تسجيل الخروج للاستراحة لمدة ساعة...');
      isResting = true;
      clearAllIntervals();
      
      if (currentBot) {
        currentBot.quit();
        currentBot = null;
      }

      setTimeout(() => {
        console.log('[Spawner-Bot] ⏰ انتهت فترة الاستراحة (ساعة واحدة). جاري إعادة إطلاق البوت...');
        isResting = false;
        startBot();
      }, REST_DURATION_MS);

    }, WORK_DURATION_MS);

    console.log('[Spawner-Bot] ⏳ الانتظار قبل التفاعل الأول مع السبونر...');
    setTimeout(() => {
      interactWithSpawner();

      spawnerInterval = setInterval(() => {
        interactWithSpawner();
      }, getRandomDelay(175000, 185000));

    }, getRandomDelay(8000, 12000));
  });

  bot.on('kicked', (reason) => {
    let readableReason = reason;
    try { readableReason = typeof reason === 'object' ? JSON.stringify(reason) : reason; } catch (e) {}
    scheduleReconnect(`Kicked: ${readableReason}`);
  });

  bot.on('end', (reason) => scheduleReconnect(`Disconnected: ${reason}`));

  bot.on('error', (err) => {
    if (!err.message.includes('abnormally large') && !err.message.includes('Chunk size')) {
      scheduleReconnect(`Error: ${err.message}`);
    }
  });
}

startBot();
