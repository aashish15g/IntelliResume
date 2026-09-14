
def log_function_time(func):
    import time
    import logging

    logging.basicConfig(filename ='analysis.log',level=logging.INFO)


    def wrapper(*args,**kwargs):
        t1 =  time.time()
        result = func(*args,**kwargs)
        t2 = time.time() - t1
        logging.info(f' Analysis ran in {t2} sec')
        return result

    return wrapper



