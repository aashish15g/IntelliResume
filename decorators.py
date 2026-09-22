import time
import logging
import functools

logger = logging.getLogger('resume_analyzer')
logger.setLevel(logging.INFO)
handler = logging.FileHandler('analysis.log')
logger.addHandler(handler)

def log_function_time(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        t1 = time.time()
        result = func(*args, **kwargs)
        t2 = time.time() - t1
        logger.info(f'Analysis ran in {t2} sec')
        return result
    return wrapper

def retry(times):
    def retry_decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(f"{func.__name__} attempt {attempt} failed: {e}")
                    if attempt < times:
                        time.sleep(1)
            logger.error(f"{func.__name__} failed after {times} attempts")
            return {"error": f"{func.__name__} failed after {times} attempts: {last_exception}"}
        return wrapper
    return retry_decorator